import Anthropic from '@anthropic-ai/sdk';
import { Request, Response } from 'express';
import {
  ExplainerDeclinedError,
  ExplainerUnavailableError,
  explainBuildError,
  isExplainerConfigured,
} from '../services/buildErrorExplainer.js';
import { createRateLimiter } from '../utils/rateLimiter.js';
import logger from '../utils/logger.js';

/** Hard cap on request size so a caller cannot make the server buffer or forward huge logs. */
export const MAX_REQUEST_LOG_CHARS = 200_000;

// Each call spends API credit, so cap it per signed-in user.
const explainRateAllowed = createRateLimiter({ windowMs: 10 * 60_000, maxRequests: 10 });

interface Dependencies {
  explain: typeof explainBuildError;
  isConfigured: () => boolean;
  rateAllowed: (key: string) => boolean;
}

export const createExplainBuildErrorHandler =
  ({ explain, isConfigured, rateAllowed }: Dependencies) =>
  async (req: Request, res: Response): Promise<any> => {
    if (!isConfigured()) {
      return res.status(503).json({
        error: 'AI explanations are not enabled on this server',
        code: 'ai_not_configured',
      });
    }

    const log = (req.body as { log?: unknown } | undefined)?.log;
    if (typeof log !== 'string' || !log.trim()) {
      return res.status(400).json({ error: 'A non-empty build log is required', code: 'invalid_log' });
    }
    if (log.length > MAX_REQUEST_LOG_CHARS) {
      return res.status(413).json({ error: 'Build log is too large to explain', code: 'log_too_large' });
    }

    const rateLimitKey = req.accessToken || req.ip || 'unknown';
    if (!rateAllowed(rateLimitKey)) {
      return res.status(429).json({
        error: 'Too many explanation requests. Please wait a few minutes and try again.',
        code: 'rate_limited',
      });
    }

    try {
      const { explanation, usage } = await explain(log);
      // Token counts only: build logs can contain repository content.
      logger.info('Build error explained', usage);
      return res.json({ explanation });
    } catch (error) {
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
  rateAllowed: explainRateAllowed,
});
