import { Router } from 'express';
import { requireAccessToken, checkWorkspaceOwner } from '../middleware/auth.js';
import {
  getSharedPreviewRoot,
  getSharedPreviewFile,
  streamBuildLogs,
  initBuild,
  updateBuildFile,
  quickUpdateBuildFile,
  serveArtifact,
  exportZip,
  startPdfBuild,
  getPdfBuildStatus,
  downloadPdf,
  getPreviewHistory,
  getPreviewHistorySnapshot,
  shareBuild,
  cleanupBuild,
  prewarmBuild,
  getBuildCacheStatus,
  legacyCompileFile,
} from '../controllers/build.controller.js';

export default function createBuildRouter(): Router {
  const router = Router();

  // Public shared preview routes (no auth)
  router.get('/shared/:token', getSharedPreviewRoot);
  router.get('/shared/:token/*', getSharedPreviewFile);

  // Build logs streaming
  router.get('/build/logs/:sessionId', requireAccessToken, checkWorkspaceOwner, streamBuildLogs);

  // Build initialization, updates, quick updates
  router.post('/build/init', requireAccessToken, initBuild);
  router.post('/build/update', requireAccessToken, updateBuildFile);
  router.post('/build/quick-update', requireAccessToken, quickUpdateBuildFile);

  // Artifact serving, exporting zip, PDF building
  router.get('/build/artifact/:sessionId/*', requireAccessToken, checkWorkspaceOwner, serveArtifact);
  router.get('/build/export/:sessionId', requireAccessToken, checkWorkspaceOwner, exportZip);
  router.post('/build/pdf/:sessionId', requireAccessToken, checkWorkspaceOwner, startPdfBuild);
  router.get('/build/pdf-status/:sessionId', requireAccessToken, checkWorkspaceOwner, getPdfBuildStatus);
  router.get('/build/pdf-download/:sessionId', requireAccessToken, checkWorkspaceOwner, downloadPdf);

  // Preview history snapshots
  router.get('/build/preview-history/:sessionId', requireAccessToken, checkWorkspaceOwner, getPreviewHistory);
  router.get('/build/preview-history/:sessionId/:snapshotId', requireAccessToken, checkWorkspaceOwner, getPreviewHistorySnapshot);

  // Sharing, cleanup, prewarming, caching
  router.post('/build/share/:sessionId', requireAccessToken, checkWorkspaceOwner, shareBuild);
  router.post('/build/cleanup', requireAccessToken, cleanupBuild);
  router.post('/build/prewarm', prewarmBuild);
  router.get('/build/cache-status', requireAccessToken, getBuildCacheStatus);

  // Legacy compile route
  router.post('/compile', requireAccessToken, legacyCompileFile);

  return router;
}
