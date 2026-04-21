import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import buildExecutor from '../services/buildExecutor.js';
import {
  ensurePreviewBundle,
} from '../services/previewBundleService.js';
import { PROOFDESK_PRETEX_LAYOUT_FIX } from '../services/previewTransformService.js';
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

const LIVE_PREVIEW_ASSET_ATTR_PATTERN = /\b(src|href)=(["'])([^"']+)\2/gi;
const LIVE_PREVIEW_ASSET_PATTERN = /\.(?:css|js)(?:$|[?#])/i;
const SKIP_LIVE_PREVIEW_VERSION_PATTERN = /^(?:[a-zA-Z][a-zA-Z\d+.-]*:|\/\/|data:|mailto:|tel:|#|\?)/;

const appendQueryParam = (url, key, value) => {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const withoutHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = withoutHash.indexOf('?');
  const pathname = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : withoutHash.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${pathname}?${params.toString()}${hash}`;
};

const versionLivePreviewAssets = (html, version) => {
  if (!version) {
    return html;
  }

  const safeVersion = String(version).slice(0, 80);

  return html.replace(
    LIVE_PREVIEW_ASSET_ATTR_PATTERN,
    (match, attr, quote, url) => {
      if (
        SKIP_LIVE_PREVIEW_VERSION_PATTERN.test(url)
        || !LIVE_PREVIEW_ASSET_PATTERN.test(url)
      ) {
        return match;
      }

      return `${attr}=${quote}${appendQueryParam(url, 'proofdeskLive', safeVersion)}${quote}`;
    }
  );
};

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
    const previewVersion = Array.isArray(req.query.t) ? req.query.t[0] : req.query.t;

    let responseContent;
    if (ext === '.html' || ext === '.htm') {
      let html = versionLivePreviewAssets(content.toString('utf-8'), previewVersion);
      // Apply the latest layout guard at serve-time so stale cached bundles are
      // also fixed without needing a full preview rebuild.
      if (!html.includes('proofdesk-pretex-layout-fix')) {
        html = html.includes('</head>')
          ? html.replace('</head>', `${PROOFDESK_PRETEX_LAYOUT_FIX}\n</head>`)
          : PROOFDESK_PRETEX_LAYOUT_FIX + html;
      }
      responseContent = html;
    } else {
      responseContent = content;
    }

    res.setHeader('Content-Type', getPreviewMimeType(ext));
    res.setHeader('Cache-Control', getPreviewCacheHeader(ext));
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(responseContent);
  });

  return router;
};

export default createPreviewRouter;
