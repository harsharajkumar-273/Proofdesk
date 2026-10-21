import Anthropic from '@anthropic-ai/sdk';
import { NextFunction, Request, Response } from 'express';
import {
  ExplainerDeclinedError,
  ExplainerRateLimitedError,
  ExplainerUnavailableError,
  explainBuildError,
  isExplainerConfigured,
  lookupExplanationModel,
} from '../services/buildErrorExplainer.js';
import { reserveModelCall, type BudgetVerdict } from '../services/aiUsageBudget.js';
import { collectSourceContext, type SourceSnippet } from '../services/buildSourceContext.js';
import { buildExecutor } from '../services/buildExecutor.js';
import { isRedisSharedStateEnabled } from '../utils/redisClient.js';
import { recordMonitoringEvent } from '../services/monitoringService.js';
import workspaceRepository from '../repositories/workspace.repository.js';
import { classifyBuildFailure, type DiagnosticAdvice } from '../utils/buildDiagnostics.js';
import { createRateLimiter } from '../utils/rateLimiter.js';
import logger from '../utils/logger.js';

const SESSION_ID = /^[0-9a-f]{16}$/;
const EXPLANATION_ID = /^[0-9a-f]{16}$/;

const feedbackRateAllowed = createRateLimiter({ windowMs: 10 * 60_000, maxRequests: 30 });

export type FailedBuildLog =
  | { status: 'failed'; log: string; hint: DiagnosticAdvice | null }
  | { status: 'succeeded' }
  | { status: 'running' }
  | { status: 'missing' };

/**
 * The output of the session's last build, read on the server so the endpoint
 * only ever explains a real build of a workspace the caller owns. Memory holds
 * the live buffer; the database covers restarts and builds that ran on
 * another instance.
 */
export const loadFailedBuildLog = async (sessionId: string): Promise<FailedBuildLog> => {
  const live = buildExecutor.getFinishedBuildLog(sessionId);
  if (live) {
    if (live.result?.success) return { status: 'succeeded' };
    const resultText = [live.result?.error, live.result?.stderr, live.result?.stdout].filter(Boolean).join('\n');
    const log = live.text.trim() ? live.text : resultText;
    const hint = live.result?.advice ? { code: live.result.code || 'build_failed', advice: live.result.advice } : null;
    return { status: 'failed', log, hint };
  }

  // With shared Redis state the worker may be another process, which never
  // closes this process's buffer, so only trust "running" for local builds.
  if (!isRedisSharedStateEnabled() && buildExecutor.isBuildLogOpen(sessionId)) return { status: 'running' };

  const stored = await workspaceRepository.getLatestBuildLog(sessionId);
  if (!stored) return { status: 'missing' };
  if (stored.status !== 'failed') return { status: 'succeeded' };
  const log = [stored.stdout, stored.stderr].filter(Boolean).join('\n');
  return { status: 'failed', log, hint: classifyBuildFailure(log) };
};

const loadSourceContext = (sessionId: string, log: string): Promise<SourceSnippet[]> =>
  collectSourceContext(buildExecutor.getSession(sessionId)?.repoPath, log);

const rateLimitKeyFor = (req: Request): string =>
  req.authSession?.user?.login || req.accessToken || req.ip || 'unknown';

interface Dependencies {
  explain: typeof explainBuildError;
  isConfigured: () => boolean;
  /** Spending limits (see aiUsageBudget); consulted only when the answer is not cached. */
  reserveModelCall: (userKey: string) => Promise<BudgetVerdict>;
  loadBuildLog: (sessionId: string) => Promise<FailedBuildLog>;
  loadSourceContext: (sessionId: string, log: string) => Promise<SourceSnippet[]>;
}

const notConfigured = (res: Response) =>
  res.status(503).json({
    error: 'AI explanations are not enabled on this server',
    code: 'ai_not_configured',
  });

/**
 * Answers 503 before the session lookup when the feature is off, so the editor
 * learns it is unavailable whatever state the workspace is in.
 */
export const requireExplainerConfigured = (_req: Request, res: Response, next: NextFunction): any =>
  isExplainerConfigured() ? next() : notConfigured(res);

export const createExplainBuildErrorHandler =
  ({ explain, isConfigured, reserveModelCall, loadBuildLog, loadSourceContext }: Dependencies) =>
  async (req: Request, res: Response): Promise<any> => {
    if (!isConfigured()) return notConfigured(res);

    const sessionId = String(req.params?.sessionId ?? '');
    if (!SESSION_ID.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID', code: 'invalid_session' });
    }

    try {
      const build = await loadBuildLog(sessionId);
      if (build.status === 'missing' || (build.status === 'failed' && !build.log.trim())) {
        return res.status(404).json({ error: 'No build output was found for this workspace', code: 'build_log_not_found' });
      }
      if (build.status === 'running') {
        return res.status(409).json({ error: 'The build is still running', code: 'build_in_progress' });
      }
      if (build.status === 'succeeded') {
        return res.status(409).json({ error: 'The latest build did not fail', code: 'build_not_failed' });
      }

      // Best effort: an explanation without source is still useful.
      const sourceContext = await loadSourceContext(sessionId, build.log).catch(() => []);
      const rateLimitKey = rateLimitKeyFor(req);

      const { explanation, usage, id, cached } = await explain(build.log, {
        sourceContext,
        hint: build.hint,
        reserveModelCall: () => reserveModelCall(rateLimitKey),
      });
      // Token counts only: build logs can contain repository content.
      if (!cached) logger.info('Build error explained', { ...usage, snippets: sourceContext.length });
      return res.json({ explanation, id, cached });
    } catch (error) {
      if (error instanceof ExplainerRateLimitedError && error.reason === 'daily_limit') {
        return res.status(429).json({
          error: 'AI explanations have reached their daily limit on this server. The keyword hint above still applies.',
          code: 'ai_daily_limit',
        });
      }
      if (error instanceof ExplainerRateLimitedError) {
        return res.status(429).json({
          error: 'Too many explanation requests. Please wait a few minutes and try again.',
          code: 'rate_limited',
        });
      }
      if (error instanceof ExplainerUnavailableError) {
        return res.status(503).json({ error: error.message, code: 'ai_not_configured' });
      }
      if (error instanceof ExplainerDeclinedError) {
        return res.status(422).json({ error: error.message, code: 'ai_declined' });
      }
      if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
        return res.status(503).json({
          error: 'The AI service is busy. Please try again shortly.',
          code: 'ai_busy',
        });
      }
      // Provider error text can include request details; log it, return a generic message.
      logger.error('Build error explanation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(502).json({ error: 'Could not get an explanation right now', code: 'ai_failed' });
    }
  };

export const explainBuildErrorHandler = createExplainBuildErrorHandler({
  explain: explainBuildError,
  isConfigured: isExplainerConfigured,
  reserveModelCall: (userKey) => reserveModelCall(userKey),
  loadBuildLog: loadFailedBuildLog,
  loadSourceContext,
});

interface FeedbackDependencies {
  record: (feedback: { explanationId: string; helpful: boolean; sessionId: string }) => Promise<unknown> | void;
  rateAllowed: (key: string) => boolean;
}

/** Records whether an explanation helped. Only the id and the vote are kept, never log or source text. */
export const createExplanationFeedbackHandler =
  ({ record, rateAllowed }: FeedbackDependencies) =>
  async (req: Request, res: Response): Promise<any> => {
    const sessionId = String(req.params?.sessionId ?? '');
    const { id, helpful } = (req.body ?? {}) as { id?: unknown; helpful?: unknown };
    if (!SESSION_ID.test(sessionId) || typeof id !== 'string' || !EXPLANATION_ID.test(id) || typeof helpful !== 'boolean') {
      return res.status(400).json({ error: 'Feedback needs an explanation id and a helpful flag', code: 'invalid_feedback' });
    }
    if (!rateAllowed(rateLimitKeyFor(req))) {
      return res.status(429).json({ error: 'Too many feedback requests', code: 'rate_limited' });
    }
    await record({ explanationId: id, helpful, sessionId });
    return res.status(204).end();
  };

export const explanationFeedbackHandler = createExplanationFeedbackHandler({
  rateAllowed: feedbackRateAllowed,
  record: async ({ explanationId, helpful, sessionId }) => {
    const model = lookupExplanationModel(explanationId) ?? 'unknown';
    logger.info('Build error explanation feedback', { explanationId, helpful, model });
    // Stored so "is the default model good enough?" can be answered with a query.
    // A missing table (schema not pushed yet) must not fail the vote.
    await workspaceRepository
      .recordExplanationFeedback({ explanationId, sessionId, helpful, model })
      .catch((error: Error) => logger.error(`[DB] Failed to store explanation feedback: ${error.message}`));
    await recordMonitoringEvent({
      level: 'info',
      category: 'ai_explanation_feedback',
      message: helpful ? 'Explanation marked helpful' : 'Explanation marked not helpful',
      metadata: { explanationId, helpful, sessionId, model },
    });
  },
});
