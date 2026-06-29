import { Router } from 'express';
import { requireAccessToken, checkWorkspaceOwner } from '../middleware/auth.js';
import {
  getDemoWorkspace,
  initWorkspace,
  getWorkspaceMeta,
  getWorkspaceFileTree,
  getWorkspaceFile,
  updateWorkspaceFile,
  getReviewMarkers,
  saveReviewMarkers,
  searchWorkspace,
  getGitStatus,
  getGitDiff,
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  commitChanges,
  pullChanges,
  pushChanges,
  switchBranch,
  createPullRequest,
  getGitCommits,
  getGitCommitFileDiff,
  rollbackFileToCommit,
} from '../controllers/workspace.controller.js';

export default function createWorkspaceRouter(): Router {
  const router = Router();

  // Public demo
  router.get('/demo', getDemoWorkspace);

  // Workspace initialization
  router.post('/workspace/init', requireAccessToken, initWorkspace);

  // Session metadata
  router.get('/workspace/:sessionId/meta', getWorkspaceMeta);

  // File tree and file management
  router.get('/workspace/:sessionId/tree', requireAccessToken, checkWorkspaceOwner, getWorkspaceFileTree);
  router.get('/workspace/:sessionId/contents/*', requireAccessToken, checkWorkspaceOwner, getWorkspaceFile);
  router.put('/workspace/:sessionId/contents/*', requireAccessToken, checkWorkspaceOwner, updateWorkspaceFile);

  // Review markers
  router.get('/workspace/:sessionId/review-markers', requireAccessToken, checkWorkspaceOwner, getReviewMarkers);
  router.put('/workspace/:sessionId/review-markers', requireAccessToken, checkWorkspaceOwner, saveReviewMarkers);

  // Workspace search
  router.get('/workspace/:sessionId/search', requireAccessToken, checkWorkspaceOwner, searchWorkspace);

  // Git operations
  router.get('/workspace/:sessionId/git/status', requireAccessToken, checkWorkspaceOwner, getGitStatus);
  router.get('/workspace/:sessionId/git/diff', requireAccessToken, checkWorkspaceOwner, getGitDiff);
  router.post('/workspace/:sessionId/git/stage', requireAccessToken, checkWorkspaceOwner, stageFile);
  router.post('/workspace/:sessionId/git/unstage', requireAccessToken, checkWorkspaceOwner, unstageFile);
  router.post('/workspace/:sessionId/git/stage-all', requireAccessToken, checkWorkspaceOwner, stageAll);
  router.post('/workspace/:sessionId/git/unstage-all', requireAccessToken, checkWorkspaceOwner, unstageAll);
  router.post('/workspace/:sessionId/git/commit', requireAccessToken, checkWorkspaceOwner, commitChanges);
  router.post('/workspace/:sessionId/git/pull', requireAccessToken, checkWorkspaceOwner, pullChanges);
  router.post('/workspace/:sessionId/git/push', requireAccessToken, checkWorkspaceOwner, pushChanges);
  router.post('/workspace/:sessionId/git/branch', requireAccessToken, checkWorkspaceOwner, switchBranch);
  router.post('/workspace/:sessionId/git/pull-request', requireAccessToken, checkWorkspaceOwner, createPullRequest);
  router.get('/workspace/:sessionId/git/commits', requireAccessToken, checkWorkspaceOwner, getGitCommits);
  router.get('/workspace/:sessionId/git/commits/:commitSha/diff', requireAccessToken, checkWorkspaceOwner, getGitCommitFileDiff);
  router.post('/workspace/:sessionId/git/commits/:commitSha/rollback', requireAccessToken, checkWorkspaceOwner, rollbackFileToCommit);

  return router;
}
