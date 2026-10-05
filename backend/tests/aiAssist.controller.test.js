import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import {
  MAX_REQUEST_LOG_CHARS,
  createExplainBuildErrorHandler,
} from '../src/controllers/aiAssist.controller.ts';
import {
  ExplainerDeclinedError,
  ExplainerUnavailableError,
} from '../src/services/buildErrorExplainer.ts';

const explanation = {
  summary: 's',
  likelyCause: 'c',
  fixSteps: ['one'],
  location: '',
  confidence: 'low',
};

const run = async (overrides = {}, body = { log: 'build failed' }) => {
  const explainCalls = [];
  const handler = createExplainBuildErrorHandler({
    explain: async (log) => {
      explainCalls.push(log);
      return { explanation, usage: { inputTokens: 1, outputTokens: 2 } };
    },
    isConfigured: () => true,
    rateAllowed: () => true,
    ...overrides,
  });
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  await handler({ body, accessToken: 'tok', ip: '1.2.3.4' }, res);
  return { res, explainCalls };
};

describe('POST /build/explain-error handler', () => {
  it('returns 503 and never calls the model when no API key is configured', async () => {
    const { res, explainCalls } = await run({ isConfigured: () => false });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'ai_not_configured');
    assert.equal(explainCalls.length, 0);
  });

  it('rejects a missing, blank or non-string log', async () => {
    for (const body of [null, {}, { log: '' }, { log: '   ' }, { log: 42 }]) {
      const { res } = await run({}, body);
      assert.equal(res.statusCode, 400, JSON.stringify(body));
      assert.equal(res.body.code, 'invalid_log');
    }
  });

  it('rejects an oversized log with 413', async () => {
    const { res, explainCalls } = await run({}, { log: 'x'.repeat(MAX_REQUEST_LOG_CHARS + 1) });
    assert.equal(res.statusCode, 413);
    assert.equal(explainCalls.length, 0);
  });

  it('returns 429 when the caller is over the rate limit, keyed by access token', async () => {
    const keys = [];
    const { res, explainCalls } = await run({ rateAllowed: (key) => { keys.push(key); return false; } });
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, 'rate_limited');
    assert.deepEqual(keys, ['tok']);
    assert.equal(explainCalls.length, 0);
  });

  it('returns the explanation on success', async () => {
    const { res, explainCalls } = await run();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { explanation });
    assert.deepEqual(explainCalls, ['build failed']);
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
