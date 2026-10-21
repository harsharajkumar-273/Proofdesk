import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import {
  createExplainBuildErrorHandler,
  createExplanationFeedbackHandler,
} from '../src/controllers/aiAssist.controller.ts';
import {
  ExplainerDeclinedError,
  ExplainerRateLimitedError,
  ExplainerUnavailableError,
} from '../src/services/buildErrorExplainer.ts';

const SESSION = '0123456789abcdef';

const explanation = {
  summary: 's',
  likelyCause: 'c',
  fixSteps: ['one'],
  location: '',
  confidence: 'low',
};

const fakeRes = () => ({
  statusCode: 200,
  body: undefined,
  ended: false,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
  end() { this.ended = true; return this; },
});

const failedBuild = { status: 'failed', log: 'ch1.xml:4: parser error', hint: { code: 'course_source_invalid', advice: 'a' } };
const snippets = [{ path: 'src/ch1.xml', line: 4, text: '> 4 | <p>' }];

const run = async (overrides = {}, params = { sessionId: SESSION }) => {
  const explainCalls = [];
  const handler = createExplainBuildErrorHandler({
    explain: async (log, options) => {
      explainCalls.push({ log, options });
      const verdict = options.reserveModelCall ? await options.reserveModelCall() : 'ok';
      if (verdict !== 'ok') throw new ExplainerRateLimitedError(verdict);
      return { explanation, usage: { inputTokens: 1, outputTokens: 2 }, id: 'feedfacefeedface', cached: false };
    },
    isConfigured: () => true,
    reserveModelCall: async () => 'ok',
    loadBuildLog: async () => failedBuild,
    loadSourceContext: async () => snippets,
    ...overrides,
  });
  const res = fakeRes();
  await handler({ params, body: { log: 'ignored: the server reads the log itself' }, accessToken: 'tok', ip: '1.2.3.4', authSession: { user: { login: 'ada' } } }, res);
  return { res, explainCalls };
};

describe('POST /build/explain-error/:sessionId handler', () => {
  it('returns 503 and never calls the model when no API key is configured', async () => {
    const { res, explainCalls } = await run({ isConfigured: () => false });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'ai_not_configured');
    assert.equal(explainCalls.length, 0);
  });

  it('rejects a malformed session id', async () => {
    for (const sessionId of [undefined, '', 'abc', '../../etc', 'ZZZZZZZZZZZZZZZZ']) {
      const { res, explainCalls } = await run({}, { sessionId });
      assert.equal(res.statusCode, 400, String(sessionId));
      assert.equal(res.body.code, 'invalid_session');
      assert.equal(explainCalls.length, 0);
    }
  });

  it('explains the log read on the server, never text from the request body', async () => {
    const { res, explainCalls } = await run();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { explanation, id: 'feedfacefeedface', cached: false });
    assert.equal(explainCalls.length, 1);
    assert.equal(explainCalls[0].log, failedBuild.log);
    assert.deepEqual(explainCalls[0].options.sourceContext, snippets);
    assert.deepEqual(explainCalls[0].options.hint, failedBuild.hint);
  });

  it('returns 404 when there is no build output and 409 when the build succeeded', async () => {
    for (const [build, status, code] of [
      [{ status: 'missing' }, 404, 'build_log_not_found'],
      [{ status: 'failed', log: '   ', hint: null }, 404, 'build_log_not_found'],
      [{ status: 'succeeded' }, 409, 'build_not_failed'],
      [{ status: 'running' }, 409, 'build_in_progress'],
    ]) {
      const { res, explainCalls } = await run({ loadBuildLog: async () => build });
      assert.equal(res.statusCode, status, code);
      assert.equal(res.body.code, code);
      assert.equal(explainCalls.length, 0);
    }
  });

  it('still explains when the source context cannot be read', async () => {
    const { res, explainCalls } = await run({ loadSourceContext: async () => { throw new Error('disk'); } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(explainCalls[0].options.sourceContext, []);
  });

  it('returns 429 when the caller is over the rate limit, keyed by GitHub login', async () => {
    const keys = [];
    const { res } = await run({ reserveModelCall: async (key) => { keys.push(key); return 'user_limit'; } });
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, 'rate_limited');
    assert.deepEqual(keys, ['ada']);
  });

  it('returns 429 with its own code when the server-wide daily limit is reached', async () => {
    const { res } = await run({ reserveModelCall: async () => 'daily_limit' });
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, 'ai_daily_limit');
  });

  it('maps service and provider errors to safe responses', async () => {
    const cases = [
      [new ExplainerUnavailableError(), 503, 'ai_not_configured'],
      [new ExplainerDeclinedError(), 422, 'ai_declined'],
      [Object.create(Anthropic.RateLimitError.prototype), 503, 'ai_busy'],
      [Object.create(Anthropic.InternalServerError.prototype), 503, 'ai_busy'],
      [new Error('upstream said: key sk-ant-leak'), 502, 'ai_failed'],
    ];
    for (const [error, status, code] of cases) {
      const { res } = await run({ explain: async () => { throw error; } });
      assert.equal(res.statusCode, status, code);
      assert.equal(res.body.code, code);
      assert.doesNotMatch(JSON.stringify(res.body), /sk-ant-leak/);
    }
  });
});

describe('POST /build/explain-error/:sessionId/feedback handler', () => {
  const runFeedback = async (body, overrides = {}) => {
    const recorded = [];
    const handler = createExplanationFeedbackHandler({
      record: (entry) => { recorded.push(entry); },
      rateAllowed: () => true,
      ...overrides,
    });
    const res = fakeRes();
    await handler({ params: { sessionId: SESSION }, body, accessToken: 'tok' }, res);
    return { res, recorded };
  };

  it('records the vote against the explanation id', async () => {
    const { res, recorded } = await runFeedback({ id: 'feedfacefeedface', helpful: false });
    assert.equal(res.statusCode, 204);
    assert.deepEqual(recorded, [{ explanationId: 'feedfacefeedface', helpful: false, sessionId: SESSION }]);
  });

  it('rejects malformed feedback without recording it', async () => {
    for (const body of [null, {}, { id: 'feedfacefeedface' }, { id: 'nope', helpful: true }, { id: 'feedfacefeedface', helpful: 'yes' }]) {
      const { res, recorded } = await runFeedback(body);
      assert.equal(res.statusCode, 400, JSON.stringify(body));
      assert.equal(recorded.length, 0);
    }
  });

  it('is rate limited', async () => {
    const { res, recorded } = await runFeedback({ id: 'feedfacefeedface', helpful: true }, { rateAllowed: () => false });
    assert.equal(res.statusCode, 429);
    assert.equal(recorded.length, 0);
  });
});
