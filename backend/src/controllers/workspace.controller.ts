import { Request, Response } from 'express';
import buildExecutor from '../services/buildExecutor.js';
import {
  prepareWorkspace,
  getWorkspaceTree,
  getWorkspaceFileContent,
  updateWorkspaceFileContent,
  getWorkspaceReviewMarkers,
  saveWorkspaceReviewMarkers,
  searchWorkspaceFiles,
  getWorkspaceSession,
} from '../services/workspaceService.js';
import {
  ensureWorkspaceGitReady,
  getWorkspaceGitStatus,
  getWorkspaceDiff,
  stageWorkspaceFile,
  unstageWorkspaceFile,
  stageAllWorkspaceFiles,
  unstageAllWorkspaceFiles,
  commitWorkspaceChanges,
  pullWorkspaceBranch,
  pushWorkspaceBranch,
  switchWorkspaceBranch,
  createWorkspacePullRequest,
  getWorkspaceCommitHistory,
  getWorkspaceFileDiffAtCommit,
  rollbackWorkspaceFileToCommit,
} from '../services/gitWorkspaceService.js';

export const getDemoWorkspace = (req: Request, res: Response): any => {
  const firstRepo = (process.env.PREWARM_REPOS || 'QBobWatson/ila').split(',')[0].trim();
  const [owner, repo] = firstRepo.split('/');
  const cached = buildExecutor.buildCache.get(`${owner}/${repo}`);
  if (!cached) {
    return res.status(503).json({ error: 'Demo build not ready yet — try again in a few minutes.', building: true });
  }
  res.json({ sessionId: cached.sessionId, owner, repo });
};

export const initWorkspace = async (req: Request, res: Response): Promise<any> => {
  const token = req.accessToken!;
  const { owner, repo, defaultBranch, preferSeed } = req.body || {};

  if (!owner || !repo) {
    return res.status(400).json({ error: 'owner and repo are required' });
  }

  try {
    const workspace = await prepareWorkspace(owner, repo, token, {
      preferSeed: Boolean(preferSeed),
      defaultBranch: defaultBranch || 'main',
      creatorLogin: req.authSession?.user?.login || null,
      notifyEmail: req.authSession?.user?.email || null,
    });
    await ensureWorkspaceGitReady(workspace.sessionId);
    const tree = await getWorkspaceTree(workspace.sessionId);
    res.json({
      ...workspace,
      tree,
    });
  } catch (error: any) {
    console.error('Workspace initialization error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to prepare workspace' });
  }
};

export const getWorkspaceMeta = async (req: Request<any>, res: Response): Promise<any> => {
  const { sessionId } = req.params;
  const session = buildExecutor.sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ repo: `${session.owner}/${session.repo}`, owner: session.owner });
};

export const getWorkspaceFileTree = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const tree = await getWorkspaceTree(req.params.sessionId, String(req.query.path || ''));
    res.json(tree);
  } catch (error: any) {
    console.error('Workspace tree error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
};

export const getWorkspaceFile = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const file = await getWorkspaceFileContent(req.params.sessionId, req.params[0]);
    res.json(file);
  } catch (error: any) {
    console.error('Workspace file read error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
};

export const updateWorkspaceFile = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const result = await updateWorkspaceFileContent(
      req.params.sessionId,
      req.params[0],
      req.body?.content || ''
    );
    res.json(result);
  } catch (error: any) {
    console.error('Workspace file write error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
};

export const getReviewMarkers = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const markers = await getWorkspaceReviewMarkers(req.params.sessionId);
    res.json(markers);
  } catch (error: any) {
    console.error('Review markers read error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
};

export const saveReviewMarkers = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    await saveWorkspaceReviewMarkers(req.params.sessionId, req.body ?? {});
    res.json({ success: true });
  } catch (error: any) {
    console.error('Review markers write error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
};

export const searchWorkspace = async (req: Request<any>, res: Response): Promise<any> => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) {
    return res.json({ results: [] });
  }
  try {
    const results = await searchWorkspaceFiles(req.params.sessionId, query);
    res.json({ results });
  } catch (error: any) {
    console.error('Workspace search error:', error.message);
    res.status(error.message === 'Workspace session not found' ? 404 : 400).json({ error: error.message });
  }
};

// ── Git Operations ──

export const getGitStatus = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const status = await getWorkspaceGitStatus(req.params.sessionId);
    res.json(status);
  } catch (error: any) {
    console.error('Workspace git status error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const getGitDiff = async (req: Request<any>, res: Response): Promise<any> => {
  const filePath = String(req.query.path || '').trim();
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    const diff = await getWorkspaceDiff(req.params.sessionId, filePath);
    res.json(diff);
  } catch (error: any) {
    console.error('Workspace git diff error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const stageFile = async (req: Request<any>, res: Response): Promise<any> => {
  const filePath = String(req.body?.path || '').trim();
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    const status = await stageWorkspaceFile(req.params.sessionId, filePath);
    res.json(status);
  } catch (error: any) {
    console.error('Workspace git stage error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const unstageFile = async (req: Request<any>, res: Response): Promise<any> => {
  const filePath = String(req.body?.path || '').trim();
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    const status = await unstageWorkspaceFile(req.params.sessionId, filePath);
    res.json(status);
  } catch (error: any) {
    console.error('Workspace git unstage error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const stageAll = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const status = await stageAllWorkspaceFiles(req.params.sessionId);
    res.json(status);
  } catch (error: any) {
    console.error('Workspace git stage-all error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const unstageAll = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const status = await unstageAllWorkspaceFiles(req.params.sessionId);
    res.json(status);
  } catch (error: any) {
    console.error('Workspace git unstage-all error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const commitChanges = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const result = await commitWorkspaceChanges(req.params.sessionId, req.body?.message || '');
    res.json(result);
  } catch (error: any) {
    console.error('Workspace git commit error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const pullChanges = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const result = await pullWorkspaceBranch(req.params.sessionId, req.accessToken!);
    res.json(result);
  } catch (error: any) {
    console.error('Workspace git pull error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const pushChanges = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const result = await pushWorkspaceBranch(req.params.sessionId, req.accessToken!);
    res.json(result);
  } catch (error: any) {
    console.error('Workspace git push error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const switchBranch = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const status = await switchWorkspaceBranch(req.params.sessionId, req.body?.branchName || '', req.accessToken!);
    res.json(status);
  } catch (error: any) {
    console.error('Workspace git branch switch error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const createPullRequest = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const result = await createWorkspacePullRequest(req.params.sessionId, req.body || {}, req.accessToken!);
    res.json(result);
  } catch (error: any) {
    console.error('Workspace PR error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const getGitCommits = async (req: Request<any>, res: Response): Promise<any> => {
  try {
    const commits = await getWorkspaceCommitHistory(req.params.sessionId);
    res.json({ success: true, commits });
  } catch (error: any) {
    console.error('Workspace git commits error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const getGitCommitFileDiff = async (req: Request<any>, res: Response): Promise<any> => {
  const { commitSha } = req.params;
  const filePath = String(req.query.path || '').trim();
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    const diff = await getWorkspaceFileDiffAtCommit(req.params.sessionId, commitSha, filePath);
    res.json({ success: true, ...diff });
  } catch (error: any) {
    console.error('Workspace git commit file diff error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

export const rollbackFileToCommit = async (req: Request<any>, res: Response): Promise<any> => {
  const { commitSha } = req.params;
  const filePath = String(req.body?.path || '').trim();
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    const status = await rollbackWorkspaceFileToCommit(req.params.sessionId, commitSha, filePath);
    res.json({ success: true, status });
  } catch (error: any) {
    console.error('Workspace rollback error:', error.message);
    res.status(400).json({ error: error.message });
  }
};
