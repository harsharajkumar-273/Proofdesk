import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import buildExecutor from '../services/buildExecutor.js';
import {
  ensurePreviewBundle,
} from '../services/previewBundleService.js';
import { getProofdeskDataPath } from '../utils/dataPaths.js';

const getPreviewMimeType = (ext) => ({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
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
  '.xml': 'application/xml',
  '.txt': 'text/plain',
}[ext] || 'application/octet-stream');

const getPreviewCacheHeader = (ext) =>
  ['.html', '.htm', '.css', '.js'].includes(ext)
    ? 'no-store'
    : 'public, max-age=60';

export const createPreviewRouter = () => {
  const router = Router();

  router.get('/:sessionId/*', async (req, res) => {
    const { sessionId } = req.params;
    const filePath = req.params[0] || 'overview.html';

    if (!/^[0-9a-f]{16}$/.test(sessionId)) {
      return res.status(400).send('Invalid session ID');
    }

    const activeSession = buildExecutor.sessions.get(sessionId);
    const outputPath = activeSession
      ? path.resolve(activeSession.outputPath)
      : path.resolve(getProofdeskDataPath(sessionId, 'output'));
    const repoPath = activeSession
      ? path.resolve(activeSession.repoPath)
      : path.resolve(getProofdeskDataPath(sessionId, 'repo'));

    const previewRoot = activeSession?.previewPath
      ? path.resolve(activeSession.previewPath)
      : await ensurePreviewBundle({
        sessionId,
        outputPath,
        repoPath,
      });

    const fullPath = path.resolve(previewRoot, filePath);
    if (!fullPath.startsWith(previewRoot + path.sep) && fullPath !== previewRoot) {
      return res.status(403).send('Access denied');
    }

    try {
      await fs.access(fullPath);
    } catch {
      // File missing — rebuild preview bundle once, then re-check
      if (!activeSession?.previewPath) {
        try {
          await ensurePreviewBundle({ sessionId, outputPath, repoPath });
        } catch (bundleError) {
          console.error(`[preview] Bundle rebuild failed for ${sessionId}:`, bundleError.message);
          return res.status(503).send('Preview bundle could not be built');
        }
      }
      try {
        await fs.access(fullPath);
      } catch {
        return res.status(404).send('Preview file not found');
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const content = await fs.readFile(fullPath);
    res.setHeader('Content-Type', getPreviewMimeType(ext));
    res.setHeader('Cache-Control', getPreviewCacheHeader(ext));
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(content);
  });

  return router;
};

export default createPreviewRouter;
