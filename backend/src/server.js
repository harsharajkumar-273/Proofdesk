// backend/src/server.js
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { Octokit } from '@octokit/rest';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import buildExecutor from './services/buildExecutor.js';
import { attachCollaborationServer } from './services/collaborationServer.js';
import { updatePreviewBundleFile } from './services/previewBundleService.js';
import { attachTerminalServer } from './services/terminalServer.js';
import authSessionStore from './services/authSessionStore.js';
import { getAuthenticatedGitHubUser } from './services/githubIdentity.js';
import {
  createWorkspacePullRequest,
  commitWorkspaceChanges,
  ensureWorkspaceGitReady,
  getWorkspaceDiff,
  getWorkspaceGitStatus,
  pullWorkspaceBranch,
  pushWorkspaceBranch,
  stageAllWorkspaceFiles,
  stageWorkspaceFile,
  switchWorkspaceBranch,
  unstageAllWorkspaceFiles,
  unstageWorkspaceFile,
} from './services/gitWorkspaceService.js';
import localTestRepoService from './services/localTestRepoService.js';
import teamSessionStore, { normalizeTeamSessionCode, isValidTeamRepo } from './services/teamSessions.js';
import { extractAccessToken, requireAccessToken } from './middleware/auth.js';
import createAuthRouter from './routes/auth.routes.js';
import createPreviewRouter from './routes/preview.routes.js';
import createSystemRouter from './routes/system.routes.js';
import { createShareToken, getShareToken } from './services/shareTokenStore.js';
import {
  getWorkspaceFileContent,
  getWorkspaceSession,
  getWorkspaceTree,
  getWorkspaceReviewMarkers,
  saveWorkspaceReviewMarkers,
  searchWorkspaceFiles,
  prepareWorkspace,
  updateWorkspaceFileContent,
} from './services/workspaceService.js';
import { buildFailurePayload } from './utils/buildDiagnostics.js';
import { isSensitiveBodyRoute, summarizeBodyForLogs } from './utils/requestLogging.js';
import {
  formatRuntimeValidation,
  validateRuntimeConfig,
} from './utils/runtimeConfig.js';
import { getProofdeskDataPath } from './utils/dataPaths.js';
import { loadRuntimeEnv } from './utils/loadRuntimeEnv.js';
import {
  getMonitoringContextFromRequest,
  recordMonitoringEvent,
} from './services/monitoringService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Simple sliding-window rate limiter ────────────────────────────────────────
// Keeps a list of request timestamps per key (token/IP).  Old entries older
// than the window are pruned on each check so memory stays bounded.
const createRateLimiter = ({ windowMs, maxRequests }) => {
  const buckets = new Map();

  return (key) => {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (buckets.get(key) || []).filter((t) => t > cutoff);
    timestamps.push(now);
    buckets.set(key, timestamps);

    // Prune buckets that have gone quiet to avoid unbounded growth
    if (buckets.size > 5000) {
      for (const [k, ts] of buckets) {
        if (ts[ts.length - 1] < cutoff) buckets.delete(k);
      }
    }

    return timestamps.length <= maxRequests;
  };
};

// 20 requests per minute per token for the GitHub search API
const repoSearchRateAllowed = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });

loadRuntimeEnv(__dirname);

const app = express();
const PORT = process.env.PORT || 4000;
const server = createServer(app);
const MATHJAX_ASSET_DIR = path.resolve(__dirname, '../node_modules/mathjax-full/es5');
let processMonitoringAttached = false;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/assets/mathjax', express.static(MATHJAX_ASSET_DIR, {
  fallthrough: true,
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  index: false,
}));

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});

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
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} [${req.requestId}] - ${req.method} ${req.path}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    const bodyPreview = isSensitiveBodyRoute(req.path)
      ? summarizeBodyForLogs(req.body)
      : JSON.stringify(req.body).substring(0, 200);
    if (bodyPreview.length > 2) {
      console.log('Body preview:', bodyPreview);
    }
  }
  next();
});

app.use(createSystemRouter());
app.use('/auth', createAuthRouter());

// ============= USER ROUTES =============
app.get('/user', async (req, res) => {
  const token = await extractAccessToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (localTestRepoService.isLocalTestToken(token)) {
    return res.json(localTestRepoService.getUser());
  }

  try {
    const user = await getAuthenticatedGitHubUser(token, req.authSession);
    if (req.authSession?.id) {
      await authSessionStore.updateSession(req.authSession.id, { user });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error.message);
    if (error.status === 401) {
      if (req.authSession?.id) {
        await authSessionStore.destroySession(req.authSession.id);
      }
      authSessionStore.clearSessionCookie(res);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// ============= REPOSITORY ROUTES =============
app.get('/repos', async (req, res) => {
  const token = await extractAccessToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (localTestRepoService.isLocalTestToken(token)) {
    return res.json(await localTestRepoService.listRepositories());
  }

  try {
    const octokit = new Octokit({ auth: token, request: { timeout: 10000 } });
    const { data } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
      type: 'all'
    });
    
    console.log(`Fetched ${data.length} repositories`);
    res.json(data);
  } catch (error) {
    console.error('Error fetching repos:', error.message);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

app.get('/repos/search', requireAccessToken, async (req, res) => {
  const token = req.accessToken;

  // Rate-limit by token to avoid exhausting GitHub's 30 req/min search quota
  if (!repoSearchRateAllowed(token)) {
    return res.status(429).json({ error: 'Too many search requests. Please wait a moment before searching again.' });
  }

  const query = String(req.query.q || '').trim().slice(0, 200);

  if (query.length < 2) {
    return res.json({ items: [] });
  }

  if (localTestRepoService.isLocalTestToken(token)) {
    const descriptor = localTestRepoService.getRepositoryDescriptor();
    const haystack = `${descriptor.full_name} ${descriptor.name} ${descriptor.description}`.toLowerCase();
    const matches = haystack.includes(query.toLowerCase()) ? [descriptor] : [];
    return res.json({ items: matches });
  }

  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.search.repos({
      q: query,
      per_page: 5,
      sort: 'stars',
      order: 'desc',
    });

    res.json({ items: data.items });
  } catch (error) {
    console.error('Error searching repositories:', error.message);
    res.status(500).json({ error: 'Failed to search repositories' });
  }
});

app.get('/repos/:owner/:name', requireAccessToken, async (req, res) => {
  const token = req.accessToken;
  const { owner, name } = req.params;

  if (localTestRepoService.isLocalTestToken(token)) {
    try {
      localTestRepoService.ensureRepo(owner, name);
      return res.json(localTestRepoService.getRepositoryDescriptor());
    } catch (error) {
      return res.status(404).json({ error: error.message });
    }
  }

  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.repos.get({ owner, repo: name });
    res.json(data);
  } catch (error) {
    console.error('Error fetching repository:', error.message);
    res.status(error.status === 404 ? 404 : 500).json({
      error: error.status === 404 ? 'Repository not found' : 'Failed to fetch repository',
    });
  }
});

app.get('/repos/:owner/:name/branches', requireAccessToken, async (req, res) => {
  const token = req.accessToken;
  const { owner, name } = req.params;

  if (localTestRepoService.isLocalTestToken(token)) {
    try {
      return res.json(await localTestRepoService.listBranches(owner, name));
    } catch (error) {
      return res.status(404).json({ error: error.message });
    }
  }

  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.repos.listBranches({ owner, repo: name, per_page: 100 });
    res.json(data);
  } catch (error) {
    console.error('Error fetching branches:', error.message);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

app.post('/workspace/init', requireAccessToken, async (req, res) => {
  const token = req.accessToken;
  const { owner, repo, defaultBranch, preferSeed } = req.body || {};

  if (!owner || !repo) {
    return res.status(400).json({ error: 'owner and repo are required' });
  }

  try {
    const workspace = await prepareWorkspace(owner, repo, token, {
      preferSeed: Boolean(preferSeed),
      defaultBranch: defaultBranch || 'main',
    });
    await ensureWorkspaceGitReady(workspace.sessionId);
    const tree = await getWorkspaceTree(workspace.sessionId);
    res.json({
      ...workspace,
      tree,
    });
  } catch (error) {
    console.error('Workspace initialization error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to prepare workspace' });
  }
});

app.get('/workspace/:sessionId/tree', requireAccessToken, async (req, res) => {
  try {
    const tree = await getWorkspaceTree(req.params.sessionId, String(req.query.path || ''));
    res.json(tree);
  } catch (error) {
    console.error('Workspace tree error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
});

app.get('/workspace/:sessionId/contents/*', requireAccessToken, async (req, res) => {
  try {
    const file = await getWorkspaceFileContent(req.params.sessionId, req.params[0]);
    res.json(file);
  } catch (error) {
    console.error('Workspace file read error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
});

app.put('/workspace/:sessionId/contents/*', requireAccessToken, async (req, res) => {
  try {
    const result = await updateWorkspaceFileContent(
      req.params.sessionId,
      req.params[0],
      req.body?.content || ''
    );
    res.json(result);
  } catch (error) {
    console.error('Workspace file write error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
});

app.get('/workspace/:sessionId/review-markers', requireAccessToken, async (req, res) => {
  try {
    const markers = await getWorkspaceReviewMarkers(req.params.sessionId);
    res.json(markers);
  } catch (error) {
    console.error('Review markers read error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
});

app.put('/workspace/:sessionId/review-markers', requireAccessToken, async (req, res) => {
  try {
    await saveWorkspaceReviewMarkers(req.params.sessionId, req.body ?? {});
    res.json({ success: true });
  } catch (error) {
    console.error('Review markers write error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
});

app.get('/workspace/:sessionId/search', requireAccessToken, async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) {
    return res.json({ results: [] });
  }
  try {
    const results = await searchWorkspaceFiles(req.params.sessionId, query);
    res.json({ results });
  } catch (error) {
    console.error('Workspace search error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
});

app.get('/workspace/:sessionId/git/status', requireAccessToken, async (req, res) => {
  try {
    const status = await getWorkspaceGitStatus(req.params.sessionId);
    res.json(status);
  } catch (error) {
    console.error('Workspace git status error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.get('/workspace/:sessionId/git/diff', requireAccessToken, async (req, res) => {
  const filePath = String(req.query.path || '').trim();
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    const diff = await getWorkspaceDiff(req.params.sessionId, filePath);
    res.json(diff);
  } catch (error) {
    console.error('Workspace git diff error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/:sessionId/git/stage', requireAccessToken, async (req, res) => {
  const filePath = String(req.body?.path || '').trim();
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    const status = await stageWorkspaceFile(req.params.sessionId, filePath);
    res.json(status);
  } catch (error) {
    console.error('Workspace git stage error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/:sessionId/git/unstage', requireAccessToken, async (req, res) => {
  const filePath = String(req.body?.path || '').trim();
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    const status = await unstageWorkspaceFile(req.params.sessionId, filePath);
    res.json(status);
  } catch (error) {
    console.error('Workspace git unstage error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/:sessionId/git/stage-all', requireAccessToken, async (req, res) => {
  try {
    const status = await stageAllWorkspaceFiles(req.params.sessionId);
    res.json(status);
  } catch (error) {
    console.error('Workspace git stage-all error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/:sessionId/git/unstage-all', requireAccessToken, async (req, res) => {
  try {
    const status = await unstageAllWorkspaceFiles(req.params.sessionId);
    res.json(status);
  } catch (error) {
    console.error('Workspace git unstage-all error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/:sessionId/git/commit', requireAccessToken, async (req, res) => {
  try {
    const result = await commitWorkspaceChanges(req.params.sessionId, req.body?.message || '');
    res.json(result);
  } catch (error) {
    console.error('Workspace git commit error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/:sessionId/git/pull', requireAccessToken, async (req, res) => {
  try {
    const result = await pullWorkspaceBranch(req.params.sessionId, req.accessToken);
    res.json(result);
  } catch (error) {
    console.error('Workspace git pull error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/:sessionId/git/push', requireAccessToken, async (req, res) => {
  try {
    const result = await pushWorkspaceBranch(req.params.sessionId, req.accessToken);
    res.json(result);
  } catch (error) {
    console.error('Workspace git push error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/:sessionId/git/branch', requireAccessToken, async (req, res) => {
  try {
    const status = await switchWorkspaceBranch(req.params.sessionId, req.body?.branchName || '', req.accessToken);
    res.json(status);
  } catch (error) {
    console.error('Workspace git branch switch error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

app.post('/workspace/:sessionId/git/pull-request', requireAccessToken, async (req, res) => {
  try {
    const result = await createWorkspacePullRequest(req.params.sessionId, req.body || {}, req.accessToken);
    res.json(result);
  } catch (error) {
    console.error('Workspace PR error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// ============= TEAM SESSION ROUTES =============

app.post('/team-sessions/create', requireAccessToken, async (req, res) => {
  const { repo, createdBy } = req.body;

  if (!isValidTeamRepo(repo)) {
    return res.status(400).json({ error: 'Valid repo object with owner, name, and fullName is required' });
  }

  try {
    const session = await teamSessionStore.createSession({ repo, createdBy });
    res.json(session);
  } catch (error) {
    console.error('[TeamSession] create error:', error.message);
    res.status(500).json({ error: 'Failed to create team session' });
  }
});

app.get('/team-sessions/:code', requireAccessToken, async (req, res) => {
  const code = normalizeTeamSessionCode(req.params.code);

  if (!code || code.length < 4) {
    return res.status(400).json({ error: 'Invalid team session code' });
  }

  try {
    const session = await teamSessionStore.getSession(code);
    if (!session) {
      return res.status(404).json({ error: 'Team session not found or expired' });
    }
    res.json(session);
  } catch (error) {
    console.error('[TeamSession] lookup error:', error.message);
    res.status(500).json({ error: 'Failed to look up team session' });
  }
});

app.use('/preview', createPreviewRouter());

// ============= PUBLIC SHARED PREVIEW (no auth) =============

app.get('/shared/:token', async (req, res) => {
  const entry = await getShareToken(req.params.token);
  if (!entry) return res.status(404).send('Share link not found or expired.');
  res.redirect(`/shared/${req.params.token}/${entry.entryFile}`);
});

app.get('/shared/:token/*', async (req, res) => {
  const entry = await getShareToken(req.params.token);
  if (!entry) return res.status(404).send('Share link not found or expired.');

  const filePath = req.params[0] || entry.entryFile;
  const outputBase = path.resolve(entry.outputPath);
  const fullPath   = path.resolve(outputBase, filePath);

  if (!fullPath.startsWith(outputBase + path.sep) && fullPath !== outputBase) {
    return res.status(403).send('Access denied');
  }

  try {
    const content = await fs.readFile(fullPath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
      '.html': 'text/html; charset=utf-8',
      '.css':  'text/css',
      '.js':   'application/javascript',
      '.svg':  'image/svg+xml',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',
      '.woff': 'font/woff',
      '.woff2':'font/woff2',
      '.ttf':  'font/ttf',
      '.ico':  'image/x-icon',
    }[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', ['.html', '.htm'].includes(ext) ? 'no-store' : 'public, max-age=300');
    res.setHeader('X-Proofdesk-Shared', '1');

    if (['.html', '.htm'].includes(ext)) {
      const EQ_FIX = `<style id="proofdesk-eq-fix">.pretex-display{display:flow-root!important;clear:both;max-width:100%;margin:1em 0!important;text-align:center;overflow-x:auto;}.pretex-display>svg.pretex{display:block!important;vertical-align:baseline!important;max-width:100%;height:auto;margin:0 auto;}.pretex-bind{display:inline-block;vertical-align:middle;line-height:0;}.pretex-inline{display:inline-block;vertical-align:middle;}mjx-container[display="true"]{display:block!important;clear:both;text-align:center;margin:0.8em auto!important;overflow-x:auto;}</style>`;
      let html = content.toString('utf-8');
      if (!html.includes('proofdesk-eq-fix')) {
        html = html.includes('</head>') ? html.replace('</head>', `${EQ_FIX}\n</head>`) : EQ_FIX + html;
      }
      return res.send(html);
    }
    res.send(content);
  } catch {
    res.status(404).send('File not found');
  }
});

// ============= BUILD ROUTES (NEW - REAL COMPILATION) =============

// Initialize build session
app.post('/build/init', requireAccessToken, async (req, res) => {
  const token = req.accessToken;
  const { owner, repo, preferSeed, defaultBranch, sessionId } = req.body;

  if (sessionId) {
    try {
      getWorkspaceSession(sessionId);
      const buildResult = await buildExecutor.build(sessionId);
      return res.json({
        sessionId,
        ...buildResult,
      });
    } catch (error) {
      return res.status(404).json({ error: error.message || 'Workspace session not found' });
    }
  }

  if (!owner || !repo) {
    return res.status(400).json({ error: 'owner and repo are required' });
  }

  // Reject names that contain characters not allowed in GitHub owner/repo names
  const safeNameRe = /^[a-zA-Z0-9_.-]+$/;
  if (!safeNameRe.test(owner) || !safeNameRe.test(repo)) {
    return res.status(400).json({ error: 'Invalid owner or repository name' });
  }

  try {
    console.log(`Initializing build for ${owner}/${repo}`);
    const workspace = await prepareWorkspace(owner, repo, token, {
      preferSeed,
      defaultBranch: defaultBranch || 'main',
    });
    const buildResult = await buildExecutor.build(workspace.sessionId);
    
    res.json({
      sessionId: workspace.sessionId,
      ...buildResult
    });
  } catch (error) {
    console.error('Build initialization error:', error);
    await recordMonitoringEvent({
      source: 'backend',
      level: 'error',
      category: 'build_init_failure',
      message: error.message || 'Build initialization failed.',
      ...getMonitoringContextFromRequest(req),
      metadata: {
        owner,
        repo,
        sessionId: sessionId || '',
        stack: process.env.NODE_ENV !== 'production' ? error.stack : '',
      },
    });
    res.status(500).json(
      buildFailurePayload(
        error.message,
        process.env.NODE_ENV !== 'production' ? error.stack : ''
      )
    );
  }
});

// Update file and rebuild
app.post('/build/update', requireAccessToken, async (req, res) => {
  const { sessionId, filePath, content } = req.body;

  try {
    console.log(`Updating file ${filePath} and rebuilding`);
    const result = await buildExecutor.updateFile(sessionId, filePath, content);
    res.json(result);
  } catch (error) {
    console.error('Build update error:', error);
    await recordMonitoringEvent({
      source: 'backend',
      level: 'error',
      category: 'build_update_failure',
      message: error.message || 'Build update failed.',
      ...getMonitoringContextFromRequest(req),
      metadata: {
        sessionId,
        filePath,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : '',
      },
    });
    res.status(500).json(
      buildFailurePayload(
        error.message,
        process.env.NODE_ENV !== 'production' ? error.stack : ''
      )
    );
  }
});

// Quick file update — writes directly to output dir for HTML/CSS/JS (no Docker rebuild)
app.post('/build/quick-update', requireAccessToken, async (req, res) => {
  const { sessionId, filePath, content } = req.body;

  if (!sessionId || !filePath || content === undefined) {
    return res.status(400).json({ error: 'sessionId, filePath and content are required' });
  }

  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const ext = path.extname(filePath).toLowerCase();
  const quickUpdateExts = ['.html', '.htm', '.css', '.js'];

  if (!quickUpdateExts.includes(ext)) {
    return res.json({ success: false, reason: 'File type requires full rebuild' });
  }

  const activeSession = buildExecutor.sessions.get(sessionId);
  const outputBase = activeSession
    ? path.resolve(activeSession.outputPath)
    : path.resolve(getProofdeskDataPath(sessionId, 'output'));
  const candidate  = path.resolve(outputBase, filePath);

  if (!candidate.startsWith(outputBase + path.sep) && candidate !== outputBase) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    await fs.access(path.dirname(candidate));
    await fs.writeFile(candidate, content, 'utf-8');
    await updatePreviewBundleFile({ sessionId, filePath, content });
    console.log(`Quick-updated output file: ${candidate}`);
    return res.json({ success: true });
  } catch {
    // File not in output dir — try to find by basename
    try {
      const files = await walkDir(outputBase);
      const match = files.find(f => path.basename(f) === path.basename(filePath));
      if (match) {
        await fs.writeFile(match, content, 'utf-8');
        const rel = path.relative(outputBase, match);
        await updatePreviewBundleFile({ sessionId, filePath: rel, content });
        console.log(`Quick-updated (matched by name): ${rel}`);
        return res.json({ success: true, resolvedPath: rel });
      }
    } catch {}

    return res.json({ success: false, reason: 'File not found in output directory' });
  }
});

// Helper: recursively list all files in a directory
async function walkDir(dir) {
  const result = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch { return result; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...await walkDir(full));
    else result.push(full);
  }
  return result;
}

// Serve build artifact
app.get('/build/artifact/:sessionId/*', requireAccessToken, async (req, res) => {
  const { sessionId } = req.params;
  const artifactPath = req.params[0];

  try {
    console.log(`Serving artifact: ${artifactPath}`);
    const content = await buildExecutor.serveArtifact(sessionId, artifactPath);
    
    // Set content type based on file extension
    const ext = path.extname(artifactPath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html',
      '.pdf': 'application/pdf',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.xml': 'application/xml',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
      '.eot': 'application/vnd.ms-fontobject',
      '.map': 'application/json',
    };
    
    res.set('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.send(content);
  } catch (error) {
    console.error('Artifact serve error:', error);
    res.status(404).json({ error: 'Artifact not found' });
  }
});

// Export compiled output as ZIP
app.get('/build/export/:sessionId', requireAccessToken, async (req, res) => {
  const { sessionId } = req.params;

  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="proofdesk-output-${sessionId.slice(0, 8)}.zip"`);

  try {
    await buildExecutor.exportZip(sessionId, res);
  } catch (error) {
    console.error('Export error:', error.message);
    if (!res.headersSent) {
      res.status(404).json({ error: error.message });
    }
  }
});

// Create a shareable public link for the current built output
app.post('/build/share/:sessionId', requireAccessToken, async (req, res) => {
  const { sessionId } = req.params;

  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const session = buildExecutor.sessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Build session not found — run a build first' });
  }

  try {
    const token = await createShareToken({
      sessionId,
      outputPath: session.outputPath,
      repoPath:   session.repoPath,
      entryFile:  req.body?.entryFile || 'overview.html',
    });

    const frontendUrl = process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 4000}`;
    const shareUrl    = `${frontendUrl}/shared/${token}`;
    res.json({ token, url: shareUrl, expiresInDays: 7 });
  } catch (error) {
    console.error('Share token error:', error.message);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// Cleanup session
app.post('/build/cleanup', requireAccessToken, async (req, res) => {
  const { sessionId } = req.body;

  try {
    await buildExecutor.cleanup(sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Pre-warm a repo: triggers a background build so the next /build/init is instant.
// Usage: POST /build/prewarm { "owner": "...", "repo": "..." }
// No auth required for public repos (useful for professor's public course repo).
app.post('/build/prewarm', async (req, res) => {
  const { owner, repo } = req.body;
  const safeNameRe = /^[a-zA-Z0-9_.-]+$/;
  if (!owner || !repo || !safeNameRe.test(owner) || !safeNameRe.test(repo)) {
    return res.status(400).json({ error: 'owner and repo are required and must be valid GitHub names' });
  }

  // Respond immediately — build runs in background
  res.json({ status: 'prewarm started', owner, repo });

  const token = req.headers.authorization?.split(' ')[1] || null;
  buildExecutor.prewarm(owner, repo, token).catch(err => {
    console.error(`Prewarm failed for ${owner}/${repo}:`, err.message);
  });
});

// Cache status: shows which repos are pre-built and ready.
app.get('/build/cache-status', requireAccessToken, (req, res) => {
  const entries = [];
  for (const [repoKey, entry] of buildExecutor.buildCache.entries()) {
    entries.push({
      repo:        repoKey,
      commitHash:  entry.commitHash?.slice(0, 7),
      builtAt:     new Date(entry.builtAt).toISOString(),
      outputPath:  entry.outputPath,
    });
  }
  res.json({ cached: entries.length, entries });
});

// ============= LEGACY COMPILE ROUTES (KEEP FOR SINGLE FILE) =============

// Compile single file (keep this for single file editing)
app.post('/compile', requireAccessToken, async (req, res) => {
  const { filename, content } = req.body;

  try {
    console.log(`Compiling file: ${filename}`);
    
    let preview = content;
    const ext = filename?.split('.').pop()?.toLowerCase();
    
    switch (ext) {
      case 'html':
        preview = content;
        break;
      
      case 'js':
      case 'jsx':
        preview = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>JavaScript Preview</title>
          </head>
          <body>
            <div id="root"></div>
            <script>${content}</script>
          </body>
          </html>
        `;
        break;
      
      case 'css':
        preview = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>CSS Preview</title>
            <style>${content}</style>
          </head>
          <body>
            <h1>CSS Preview</h1>
            <p>Your styles have been applied to this page.</p>
            <div class="test">Test div with class="test"</div>
            <button>Button</button>
            <input type="text" placeholder="Input field">
          </body>
          </html>
        `;
        break;
        
      default:
        preview = `<pre>${content}</pre>`;
    }

    res.json({
      success: true,
      output: content,
      preview: preview
    });
  } catch (error) {
    console.error('Compilation error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Compilation failed',
      message: error.message
    });
  }
});

// ============= START SERVER =============
let collaborationAttached = false;
let collaborationServer = null;
let terminalAttached = false;
let terminalServer = null;
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

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url || '', 'http://localhost');

    if ((requestUrl.pathname === '/collab/ws' || requestUrl.pathname === '/collaboration/ws') && collaborationServer) {
      collaborationServer.handleUpgrade(request, socket, head, (connection) => {
        collaborationServer.emit('connection', connection, request);
      });
      return;
    }

    if (requestUrl.pathname === '/terminal/ws' && terminalServer) {
      terminalServer.handleUpgrade(request, socket, head, (connection) => {
        terminalServer.emit('connection', connection, request);
      });
      return;
    }

    socket.destroy();
  });

  upgradeRoutingAttached = true;
};

const parseGitHubRepo = (entry) => {
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

app.use((error, req, res, next) => {
  console.error(`[${req.requestId || 'unknown'}] Unhandled backend error:`, error);
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
      console.log(`Pre-warming ${prewarmList.length} repo(s): ${prewarmList.map((repo) => `${repo.owner}/${repo.repo}`).join(', ')}`);
      for (const { owner, repo } of prewarmList) {
        buildExecutor.prewarm(owner, repo, null).catch(() => {});
      }
    }
  });
};

export { app, server };

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  startServer();
}
