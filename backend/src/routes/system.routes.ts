import { Router, Request, Response } from 'express';
import { requireAccessToken } from '../middleware/auth.js';
import {
  getMonitoringContextFromRequest,
  readRecentMonitoringEvents,
  recordMonitoringEvent,
} from '../services/monitoringService.js';
import teamSessionStore, {
  isValidTeamRepo,
  normalizeTeamSessionCode,
} from '../services/teamSessions.js';
import { getReadinessPayload } from '../utils/runtimeConfig.js';
import { register } from '../services/metricsService.js';

export const createSystemRouter = (): Router => {
  const router = Router();

  router.get('/health', (req: Request, res: Response) => {
    const readiness = getReadinessPayload(process.env);

    res.json({
      status: 'OK',
      ready: readiness.ready,
      mode: readiness.mode,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  router.get('/health/ready', (req: Request, res: Response) => {
    const readiness = getReadinessPayload(process.env, {
      strict: process.env.NODE_ENV === 'production',
    });

    res.status(readiness.ready ? 200 : 503).json({
      ...readiness,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err: any) {
      res.status(500).end(err.message || err);
    }
  });

  router.post('/monitoring/client-error', async (req: Request, res: Response): Promise<any> => {
    const message = String(req.body?.message || '').trim();

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    await recordMonitoringEvent({
      source: 'frontend',
      level: 'error',
      category: String(req.body?.category || 'frontend_runtime_error'),
      message,
      ...getMonitoringContextFromRequest(req),
      metadata: {
        pathname: req.body?.pathname || '',
        href: req.body?.href || '',
        stack: req.body?.stack || '',
        componentStack: req.body?.componentStack || '',
        metadata: req.body?.metadata || null,
      },
    });

    res.status(202).json({
      accepted: true,
      requestId: req.requestId,
    });
  });

  router.get('/monitoring/events', requireAccessToken, async (req: Request, res: Response) => {
    const limitQuery = req.query.limit;
    const limit = typeof limitQuery === 'string' || typeof limitQuery === 'number' ? Number(limitQuery) : undefined;
    const events = await readRecentMonitoringEvents({
      limit,
    });

    res.json({
      events,
    });
  });

  router.post('/team-sessions/create', requireAccessToken, async (req: Request, res: Response): Promise<any> => {
    const { repo, createdBy } = req.body || {};

    if (!isValidTeamRepo(repo)) {
      return res.status(400).json({ error: 'Valid repository details are required' });
    }

    const session = await teamSessionStore.createSession({ repo, createdBy });
    res.json(session);
  });

  router.post('/team-sessions/join', async (req: Request, res: Response): Promise<any> => {
    const code = normalizeTeamSessionCode(req.body?.code);

    if (!code) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    const session = await teamSessionStore.getSession(code);
    if (!session) {
      return res.status(404).json({ error: 'Invite code not found or expired' });
    }

    res.json(session);
  });

  return router;
};

export default createSystemRouter;
