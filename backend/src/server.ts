import './otel.js';
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import buildExecutor from './services/buildExecutor.js';
import { attachCollaborationServer } from './services/collaborationServer.js';
import { attachTerminalServer } from './services/terminalServer.js';
import localTestRepoService from './services/localTestRepoService.js';
import { extractAccessToken } from './middleware/auth.js';
import createAuthRouter from './routes/auth.routes.js';
import createPreviewRouter from './routes/preview.routes.js';
import createSystemRouter from './routes/system.routes.js';
import createRepositoryRouter from './routes/repository.routes.js';
import createWorkspaceRouter from './routes/workspace.routes.js';
import createBuildRouter from './routes/build.routes.js';
import createTeamRouter from './routes/team.routes.js';
import createImportRouter from './routes/import.routes.js';
import createGraphRouter from './routes/graph.routes.js';
import { loadRuntimeEnv } from './utils/loadRuntimeEnv.js';
import { formatRuntimeValidation, validateRuntimeConfig } from './utils/runtimeConfig.js';
import { getMonitoringContextFromRequest, recordMonitoringEvent } from './services/monitoringService.js';
import { getProofdeskDataPath } from './utils/dataPaths.js';
import { logger, requestContainer } from './utils/logger.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { tracingMiddleware } from './middleware/tracing.js';
import { startBuildWorker } from './services/buildQueue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadRuntimeEnv(__dirname);

const app = express();
const PORT = process.env.PORT || 4000;
const server = createServer(app);
const MATHJAX_ASSET_DIR = path.resolve(__dirname, '../node_modules/mathjax-full/es5');
let processMonitoringAttached = false;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/assets/mathjax', express.static(MATHJAX_ASSET_DIR, {
  fallthrough: true,
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  index: false,
}));

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  requestContainer.run({ requestId }, () => {
    next();
  });
});

app.use(tracingMiddleware);
app.use(metricsMiddleware);

// CORS - allow dev frontend origins plus the backend preview origin itself.
const allowedOrigins = Array.from(new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  process.env.FRONTEND_URL,
].filter(Boolean)));

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Route Registrations
app.use(createSystemRouter());
app.use('/auth', createAuthRouter());
app.use('/preview', createPreviewRouter());

// Mount Refactored Routers
app.use(createRepositoryRouter());
app.use(createWorkspaceRouter());
app.use(createBuildRouter());
app.use(createTeamRouter());
app.use(createImportRouter());
app.use(createGraphRouter());

// User Details Route
app.get('/user', async (req: Request, res: Response): Promise<any> => {
  const token = await extractAccessToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (localTestRepoService.isLocalTestToken(token)) {
    return res.json(localTestRepoService.getUser());
  }

  try {
    const octokit = new (await import('@octokit/rest')).Octokit({ auth: token });
    const { data: user } = await octokit.users.getAuthenticated();
    res.json(user);
  } catch (error: any) {
    console.error('Error fetching user:', error.message);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// ============= START SERVER =============
let collaborationAttached = false;
let collaborationServer: any = null;
let terminalAttached = false;
let terminalServer: any = null;
let upgradeRoutingAttached = false;

const ensureCollaborationServer = () => {
  if (collaborationAttached) return;
  collaborationServer = attachCollaborationServer();
  collaborationAttached = true;
};

const ensureTerminalServer = () => {
  if (terminalAttached) return;
  terminalServer = attachTerminalServer();
  terminalAttached = true;
};

const ensureRealtimeUpgradeRouting = () => {
  if (upgradeRoutingAttached) return;

  server.on('upgrade', (request: any, socket: any, head: any) => {
    const requestUrl = new URL(request.url || '', 'http://localhost');

    if ((requestUrl.pathname === '/collab/ws' || requestUrl.pathname === '/collaboration/ws') && collaborationServer) {
      collaborationServer.handleUpgrade(request, socket, head, (connection: any) => {
        collaborationServer.emit('connection', connection, request);
      });
      return;
    }

    if (requestUrl.pathname === '/terminal/ws' && terminalServer) {
      terminalServer.handleUpgrade(request, socket, head, (connection: any) => {
        terminalServer.emit('connection', connection, request);
      });
      return;
    }

    socket.destroy();
  });

  upgradeRoutingAttached = true;
};

interface RepoParseResult {
  owner: string;
  repo: string;
}

const parseGitHubRepo = (entry: string): RepoParseResult | null => {
  const s = entry.trim().replace(/\.git$/, '');
  const urlMatch = s.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const parts = s.split('/').filter(Boolean);
  if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  return null;
};

const attachProcessMonitoring = () => {
  if (processMonitoringAttached) return;

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : '';
    void recordMonitoringEvent({
      source: 'backend',
      level: 'error',
      category: 'process_unhandled_rejection',
      message,
      metadata: {
        stack,
      },
    });
  });

  process.on('uncaughtExceptionMonitor', (error, origin) => {
    void recordMonitoringEvent({
      source: 'backend',
      level: 'error',
      category: 'process_uncaught_exception',
      message: error.message || 'Uncaught backend exception',
      metadata: {
        origin,
        stack: error.stack || '',
      },
    });
  });

  processMonitoringAttached = true;
};

app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(`Unhandled backend error: ${error.message || error}`, error);
  void recordMonitoringEvent({
    source: 'backend',
    level: 'error',
    category: 'http_unhandled_error',
    message: error.message || 'Unhandled backend request error.',
    ...getMonitoringContextFromRequest(req),
    metadata: {
      stack: process.env.NODE_ENV !== 'production' ? error.stack : '',
    },
  });

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    requestId: req.requestId,
  });
});

export const startServer = () => {
  const runtimeValidation = validateRuntimeConfig(process.env, {
    strict: process.env.NODE_ENV === 'production',
  });

  if (!runtimeValidation.ready && process.env.NODE_ENV === 'production') {
    throw new Error(`Runtime configuration invalid.\n${formatRuntimeValidation(runtimeValidation)}`);
  }

  attachProcessMonitoring();
  ensureCollaborationServer();
  ensureTerminalServer();
  ensureRealtimeUpgradeRouting();
  startBuildWorker();

  // Start the periodic cleanup task (every hour) to prevent disk exhaustion
  buildExecutor.startPeriodicCleanup();
  // Trigger an initial cleanup run after a short delay to free space immediately
  setTimeout(() => {
    buildExecutor.runGlobalCleanup().catch((err: any) => {
      console.error('[Cleanup] Initial cleanup run failed:', err.message);
    });
  }, 10000);

  return server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`  GITHUB_CLIENT_ID:  ${process.env.GITHUB_CLIENT_ID ? 'set' : 'NOT SET'}`);
    console.log(`  GITHUB_CLIENT_SECRET: ${process.env.GITHUB_CLIENT_SECRET ? 'set' : 'NOT SET'}`);
    console.log(`  FRONTEND_URL:      ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`  LOCAL_TEST_MODE:   ${localTestRepoService.isEnabled() ? 'enabled' : 'disabled'}`);
    console.log(`  RUNTIME_READY:     ${runtimeValidation.ready ? 'yes' : 'no'}`);

    if (runtimeValidation.errors.length > 0 || runtimeValidation.warnings.length > 0) {
      console.log(formatRuntimeValidation(runtimeValidation));
    }

    const prewarmList = (process.env.PREWARM_REPOS || '')
      .split(',')
      .map(parseGitHubRepo)
      .filter(Boolean);

    if (prewarmList.length > 0) {
      console.log(`Pre-warming ${prewarmList.length} repo(s): ${prewarmList.map((repo: any) => `${repo.owner}/${repo.repo}`).join(', ')}`);
      for (const repoInfo of prewarmList) {
        if (repoInfo) {
          buildExecutor.prewarm(repoInfo.owner, repoInfo.repo, null).catch(() => {});
        }
      }
    }
  });
};

export { app, server };

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  startServer();
}
