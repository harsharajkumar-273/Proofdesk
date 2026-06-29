import { Request, Response } from 'express';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import buildExecutor from '../services/buildExecutor.js';
import { getWorkspaceSession, prepareWorkspace } from '../services/workspaceService.js';
import { createShareToken, getShareToken } from '../services/shareTokenStore.js';
import { listPreviewSnapshots, readPreviewSnapshotHtml } from '../services/previewHistoryService.js';
import { injectLatestPreTeXtLayoutFix } from '../services/previewTransformService.js';
import { updatePreviewBundleFile } from '../services/previewBundleService.js';
import { getProofdeskDataPath } from '../utils/dataPaths.js';
import { buildFailurePayload } from '../utils/buildDiagnostics.js';
import { getMonitoringContextFromRequest, recordMonitoringEvent } from '../services/monitoringService.js';

// rate limiter helper for build initialization
const createRateLimiter = ({ windowMs, maxRequests }: { windowMs: number; maxRequests: number }) => {
  const buckets = new Map<string, number[]>();

  return (key: string) => {
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (buckets.get(key) || []).filter((t) => t > cutoff);
    timestamps.push(now);
    buckets.set(key, timestamps);

    if (buckets.size > 5000) {
      for (const [k, ts] of buckets) {
        if (ts[ts.length - 1] < cutoff) buckets.delete(k);
      }
    }

    return timestamps.length <= maxRequests;
  };
};

const buildInitRateAllowed = createRateLimiter({ windowMs: 10 * 60_000, maxRequests: 3 });

export const getSharedPreviewRoot = async (req: Request, res: Response): Promise<any> => {
  const entry = await getShareToken(req.params.token as string);
  if (!entry) return res.status(404).send('Share link not found or expired.');
  res.redirect(`/shared/${req.params.token}/${entry.entryFile}`);
};

export const getSharedPreviewFile = async (req: Request, res: Response): Promise<any> => {
  const entry = await getShareToken(req.params.token as string);
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
    const mime: Record<string, string> = {
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
    };
    const contentType = mime[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', ['.html', '.htm'].includes(ext) ? 'no-store' : 'public, max-age=300');
    res.setHeader('X-Proofdesk-Shared', '1');

    if (['.html', '.htm'].includes(ext)) {
      const html = content.toString('utf-8');
      return res.send(injectLatestPreTeXtLayoutFix(html));
    }
    res.send(content);
  } catch {
    res.status(404).send('File not found');
  }
};

export const streamBuildLogs = (req: Request, res: Response): any => {
  const { sessionId } = req.params as any;
  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(': connected\n\n');

  const unsub = buildExecutor.subscribeToLogs(sessionId, (event: any) => {
    if (event.type === 'line') {
      res.write(`data: ${JSON.stringify({ line: event.line, stream: event.stream })}\n\n`);
    } else if (event.type === 'done') {
      res.write(`event: done\ndata: ${JSON.stringify(event.result)}\n\n`);
      res.end();
    }
  });

  const pingTimer = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(pingTimer);
    unsub();
  });
};

export const initBuild = async (req: Request, res: Response): Promise<any> => {
  const token = req.accessToken;
  const { owner, repo, preferSeed, defaultBranch, sessionId, xmlId } = req.body;

  const rateLimitKey = token || req.ip!;
  if (!buildInitRateAllowed(rateLimitKey)) {
    return res.status(429).json({
      error: 'Build rate limit exceeded. Please wait a few minutes before starting another build.',
      retryAfter: 600,
    });
  }

  if (sessionId) {
    const existingSession = buildExecutor.sessions.get(sessionId);
    const initLogin = req.authSession?.user?.login;
    if (initLogin && existingSession?.creatorLogin && existingSession.creatorLogin !== initLogin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    try {
      getWorkspaceSession(sessionId);
      const result = await buildExecutor.startBuild(sessionId, { xmlId: xmlId || null, traceParent: res.locals.traceParent });
      if (result === null) {
        return res.json({ sessionId, building: true });
      }
      return res.json({ ...result, sessionId });
    } catch (error: any) {
      return res.status(404).json({ error: error.message || 'Workspace session not found' });
    }
  }

  if (!owner || !repo) {
    return res.status(400).json({ error: 'owner and repo are required' });
  }

  const safeNameRe = /^[a-zA-Z0-9_.-]+$/;
  if (!safeNameRe.test(owner) || !safeNameRe.test(repo)) {
    return res.status(400).json({ error: 'Invalid owner or repository name' });
  }

  try {
    console.log(`Initializing build for ${owner}/${repo}`);
    const workspace = await prepareWorkspace(owner, repo, token, {
      preferSeed,
      defaultBranch: defaultBranch || 'main',
      creatorLogin: req.authSession?.user?.login || null,
      notifyEmail: req.authSession?.user?.email || null,
    });
    const result = await buildExecutor.startBuild(workspace.sessionId, { xmlId: xmlId || null, traceParent: res.locals.traceParent });
    if (result === null) {
      return res.json({ sessionId: workspace.sessionId, building: true });
    }
    res.json({ ...result, sessionId: workspace.sessionId });
  } catch (error: any) {
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
};

export const updateBuildFile = async (req: Request, res: Response): Promise<any> => {
  const { sessionId, filePath, content, sectionXmlId } = req.body;
  const updateLogin = req.authSession?.user?.login;
  const updateSession = buildExecutor.sessions.get(sessionId);
  if (updateLogin && updateSession?.creatorLogin && updateSession.creatorLogin !== updateLogin) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const xmlId = sectionXmlId && /^[a-zA-Z0-9_-]+$/.test(sectionXmlId) ? sectionXmlId : null;
    console.log(`Updating file ${filePath} and rebuilding${xmlId ? ` (section: ${xmlId})` : ''}`);
    const result = await buildExecutor.updateFile(sessionId, filePath, content, xmlId, res.locals.traceParent);
    res.json(result);
  } catch (error: any) {
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
};

async function walkDir(dir: string): Promise<string[]> {
  const result: string[] = [];
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

export const quickUpdateBuildFile = async (req: Request, res: Response): Promise<any> => {
  const { sessionId, filePath, content } = req.body;

  if (!sessionId || !filePath || content === undefined) {
    return res.status(400).json({ error: 'sessionId, filePath and content are required' });
  }

  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const quickLogin = req.authSession?.user?.login;
  const quickSession = buildExecutor.sessions.get(sessionId);
  if (quickLogin && quickSession?.creatorLogin && quickSession.creatorLogin !== quickLogin) {
    return res.status(403).json({ error: 'Access denied' });
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
};

export const serveArtifact = async (req: Request, res: Response): Promise<any> => {
  const { sessionId } = req.params as any;
  const artifactPath = req.params[0];

  try {
    console.log(`Serving artifact: ${artifactPath}`);
    const content = await buildExecutor.serveArtifact(sessionId, artifactPath);
    
    const ext = path.extname(artifactPath).toLowerCase();
    const contentTypes: Record<string, string> = {
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
};

export const exportZip = async (req: Request, res: Response): Promise<any> => {
  const { sessionId } = req.params as any;

  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="proofdesk-output-${sessionId.slice(0, 8)}.zip"`);

  try {
    await buildExecutor.exportZip(sessionId, res);
  } catch (error: any) {
    console.error('Export error:', error.message);
    if (!res.headersSent) {
      res.status(404).json({ error: error.message });
    }
  }
};

export const startPdfBuild = async (req: Request, res: Response): Promise<any> => {
  const { sessionId } = req.params as any;
  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  try {
    buildExecutor.buildPdf(sessionId).catch(() => {});
    res.json({ pdfBuilding: true });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

export const getPdfBuildStatus = async (req: Request, res: Response): Promise<any> => {
  const { sessionId } = req.params as any;
  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const session = buildExecutor.sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (buildExecutor.pdfBuilds.has(sessionId)) {
    return res.json({ status: 'building' });
  }

  if (session.pdfReady) {
    return res.json({ status: 'ready' });
  }

  res.json({ status: 'idle' });
};

export const downloadPdf = async (req: Request, res: Response): Promise<any> => {
  const { sessionId } = req.params as any;
  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const session = buildExecutor.sessions.get(sessionId);
  if (!session || !session.pdfReady) {
    return res.status(503).json({ error: 'PDF not ready — start a PDF build first' });
  }

  const pdfPath = path.join(session.outputPath, 'textbook.pdf');
  try {
    await fs.access(pdfPath);
  } catch {
    return res.status(404).json({ error: 'PDF file not found' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="proofdesk-${sessionId.slice(0, 8)}.pdf"`);
  createReadStream(pdfPath).pipe(res);
};

export const getPreviewHistory = async (req: Request, res: Response): Promise<any> => {
  const { sessionId } = req.params as any;
  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  try {
    const snapshots = await listPreviewSnapshots(sessionId);
    res.json({ snapshots });
  } catch (error: any) {
    console.error('Preview history error:', error.message);
    res.status(500).json({ error: 'Failed to load preview history' });
  }
};

export const getPreviewHistorySnapshot = async (req: Request, res: Response): Promise<any> => {
  const { sessionId, snapshotId } = req.params as any;
  if (!/^[0-9a-f]{16}$/.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }
  if (!/^[0-9a-f]{12}$/.test(snapshotId)) {
    return res.status(400).json({ error: 'Invalid snapshot ID' });
  }

  try {
    const session = buildExecutor.sessions.get(sessionId);
    const entryFile = String(req.query.entryFile || 'overview.html');
    const baseHref = `/preview/${sessionId}/${path.dirname(entryFile) === '.' ? '' : `${path.dirname(entryFile)}/`}`;
    let html = await readPreviewSnapshotHtml(sessionId, snapshotId);

    if (!/<base\s/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
    }

    if (session?.previewPath) {
      html = injectLatestPreTeXtLayoutFix(html);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (error: any) {
    console.error('Preview snapshot error:', error.message);
    res.status(404).json({ error: 'Snapshot not found' });
  }
};

export const shareBuild = async (req: Request, res: Response): Promise<any> => {
  const { sessionId } = req.params as any;

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
  } catch (error: any) {
    console.error('Share token error:', error.message);
    res.status(500).json({ error: 'Failed to create share link' });
  }
};

export const cleanupBuild = async (req: Request, res: Response): Promise<any> => {
  const { sessionId } = req.body;
  const cleanupLogin = req.authSession?.user?.login;
  const cleanupSession = buildExecutor.sessions.get(sessionId);
  if (cleanupLogin && cleanupSession?.creatorLogin && cleanupSession.creatorLogin !== cleanupLogin) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    await buildExecutor.cleanup(sessionId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const prewarmBuild = async (req: Request, res: Response): Promise<any> => {
  const { owner, repo } = req.body;
  const safeNameRe = /^[a-zA-Z0-9_.-]+$/;
  if (!owner || !repo || !safeNameRe.test(owner) || !safeNameRe.test(repo)) {
    return res.status(400).json({ error: 'owner and repo are required and must be valid GitHub names' });
  }

  res.json({ status: 'prewarm started', owner, repo });

  const token = req.headers.authorization?.split(' ')[1] || null;
  buildExecutor.prewarm(owner, repo, token as any).catch((err: any) => {
    console.error(`Prewarm failed for ${owner}/${repo}:`, err.message);
  });
};

export const getBuildCacheStatus = (req: Request, res: Response): any => {
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
};

export const legacyCompileFile = async (req: Request, res: Response): Promise<any> => {
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
  } catch (error: any) {
    console.error('Legacy compilation error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Compilation failed',
      message: error.message
    });
  }
};
