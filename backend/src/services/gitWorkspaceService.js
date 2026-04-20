import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { Octokit } from '@octokit/rest';
import { getWorkspaceSession } from './workspaceService.js';

const execFileAsync = promisify(execFile);

const withGitAuthConfig = (args, token, needsRemote = false) => {
  if (!token || !needsRemote) {
    return args;
  }

  const authHeader = `Authorization: Basic ${Buffer.from(`x-token:${token}`).toString('base64')}`;
  return ['-c', `http.extraHeader=${authHeader}`, ...args];
};

const runGit = async (cwd, args, options = {}) => {
  const {
    token = null,
    needsRemote = false,
    allowFailure = false,
    maxBuffer = 20 * 1024 * 1024,
  } = options;

  const finalArgs = withGitAuthConfig(args, token, needsRemote);

  try {
    const { stdout, stderr } = await execFileAsync('git', finalArgs, {
      cwd,
      maxBuffer,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });

    return {
      stdout: stdout || '',
      stderr: stderr || '',
      code: 0,
    };
  } catch (error) {
    if (allowFailure) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
        code: Number(error.code || 1),
      };
    }

    const message = error.stderr || error.stdout || error.message || 'Git command failed';
    throw new Error(message.trim());
  }
};

const hasGitDirectory = async (repoPath) => {
  try {
    await fs.access(path.join(repoPath, '.git'));
    return true;
  } catch {
    return false;
  }
};

const parseStatusEntries = (statusOutput = '') =>
  statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const x = line[0];
      const y = line[1];
      const rawPath = line.slice(3).trim();
      const [pathPart, renamedTo] = rawPath.split(' -> ');
      const filePath = renamedTo || pathPart;

      let status = 'modified';
      if (x === '?' && y === '?') {
        status = 'untracked';
      } else if (x === 'A' || y === 'A') {
        status = 'added';
      } else if (x === 'D' || y === 'D') {
        status = 'deleted';
      } else if (x === 'R' || y === 'R') {
        status = 'renamed';
      }

      return {
        path: filePath,
        previousPath: renamedTo ? pathPart : null,
        indexStatus: x,
        worktreeStatus: y,
        status,
        staged: x !== ' ' && x !== '?',
        unstaged: y !== ' ' && y !== '?',
      };
    });

const normalizeBranchList = (lines = '') =>
  [...new Set(
    lines
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^origin\//, ''))
      .filter((line) => line !== 'HEAD')
  )];

const getRemoteName = async (cwd) => {
  const { stdout } = await runGit(cwd, ['remote'], { allowFailure: true });
  const remote = stdout
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return remote || null;
};

export const ensureWorkspaceGitReady = async (sessionId) => {
  const session = getWorkspaceSession(sessionId);
  const repoPath = path.resolve(session.repoPath);
  const branchName = session.defaultBranch || 'main';

  if (!(await hasGitDirectory(repoPath))) {
    await runGit(repoPath, ['init', '-b', branchName]);
    await runGit(repoPath, ['add', '-A']);
    await runGit(repoPath, ['config', 'user.name', 'Proofdesk Local Demo']);
    await runGit(repoPath, ['config', 'user.email', 'demo@proofdesk.local']);
    const commitResult = await runGit(repoPath, ['commit', '-m', 'Initial workspace snapshot'], {
      allowFailure: true,
    });
    if (commitResult.code !== 0 && !/nothing to commit/i.test(commitResult.stderr)) {
      throw new Error(commitResult.stderr.trim() || 'Failed to initialize local workspace repository');
    }
    session.defaultBranch = branchName;
    return session;
  }

  const nameResult = await runGit(repoPath, ['config', '--get', 'user.name'], { allowFailure: true });
  if (nameResult.code !== 0 || !nameResult.stdout.trim()) {
    await runGit(repoPath, ['config', 'user.name', 'Proofdesk Workspace']);
  }

  const emailResult = await runGit(repoPath, ['config', '--get', 'user.email'], { allowFailure: true });
  if (emailResult.code !== 0 || !emailResult.stdout.trim()) {
    await runGit(repoPath, ['config', 'user.email', 'workspace@proofdesk.local']);
  }

  return session;
};

export const fetchWorkspaceBranches = async (sessionId, options = {}, tokenOverride = null) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  // Replenish the session token if it was lost (e.g. server restart while the
  // workspace directory still exists on disk and the user's auth cookie is valid).
  const token = tokenOverride || session.token || null;
  if (tokenOverride && !session.token) session.token = tokenOverride;
  const cwd = path.resolve(session.repoPath);
  const remoteName = await getRemoteName(cwd);

  if (options.refreshRemote !== false && remoteName) {
    await runGit(cwd, ['fetch', '--prune', remoteName], {
      token,
      needsRemote: true,
      allowFailure: true,
    });
  }

  const currentBranchResult = await runGit(cwd, ['branch', '--show-current']);
  const currentBranch = currentBranchResult.stdout.trim() || session.defaultBranch || 'main';

  const localBranches = await runGit(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
  const remoteBranches = remoteName
    ? await runGit(cwd, ['for-each-ref', '--format=%(refname:short)', `refs/remotes/${remoteName}`], {
        allowFailure: true,
      })
    : { stdout: '' };

  return {
    currentBranch,
    remoteName,
    branches: normalizeBranchList(`${localBranches.stdout}\n${remoteBranches.stdout}`),
  };
};

export const getWorkspaceGitStatus = async (sessionId) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  const cwd = path.resolve(session.repoPath);
  const branchInfo = await fetchWorkspaceBranches(sessionId, { refreshRemote: false });
  const statusResult = await runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=all']);

  return {
    currentBranch: branchInfo.currentBranch,
    branches: branchInfo.branches,
    remoteName: branchInfo.remoteName,
    files: parseStatusEntries(statusResult.stdout),
  };
};

export const stageWorkspaceFile = async (sessionId, filePath) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  await runGit(session.repoPath, ['add', '--', filePath]);
  return getWorkspaceGitStatus(sessionId);
};

export const unstageWorkspaceFile = async (sessionId, filePath) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  const restoreResult = await runGit(session.repoPath, ['restore', '--staged', '--', filePath], {
    allowFailure: true,
  });

  if (restoreResult.code !== 0) {
    await runGit(session.repoPath, ['reset', 'HEAD', '--', filePath]);
  }

  return getWorkspaceGitStatus(sessionId);
};

export const stageAllWorkspaceFiles = async (sessionId) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  await runGit(session.repoPath, ['add', '-A']);
  return getWorkspaceGitStatus(sessionId);
};

export const unstageAllWorkspaceFiles = async (sessionId) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  const restoreResult = await runGit(session.repoPath, ['restore', '--staged', '.'], {
    allowFailure: true,
  });

  if (restoreResult.code !== 0) {
    await runGit(session.repoPath, ['reset']);
  }

  return getWorkspaceGitStatus(sessionId);
};

export const getWorkspaceDiff = async (sessionId, filePath) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  const cwd = path.resolve(session.repoPath);
  const unstaged = await runGit(cwd, ['diff', '--', filePath], { allowFailure: true, maxBuffer: 40 * 1024 * 1024 });
  const staged = await runGit(cwd, ['diff', '--cached', '--', filePath], { allowFailure: true, maxBuffer: 40 * 1024 * 1024 });

  return {
    filePath,
    unstaged: unstaged.stdout,
    staged: staged.stdout,
  };
};

export const commitWorkspaceChanges = async (sessionId, message) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  const cwd = path.resolve(session.repoPath);
  const status = await getWorkspaceGitStatus(sessionId);

  if (!message?.trim()) {
    throw new Error('Commit message is required');
  }

  if (!status.files.some((file) => file.staged)) {
    throw new Error('Stage at least one file before committing');
  }

  await runGit(cwd, ['commit', '-m', message.trim()]);
  const commitSha = (await runGit(cwd, ['rev-parse', 'HEAD'])).stdout.trim();

  return {
    commitSha,
    status: await getWorkspaceGitStatus(sessionId),
  };
};

export const pullWorkspaceBranch = async (sessionId, tokenOverride = null) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  const token = tokenOverride || session.token || null;
  if (tokenOverride && !session.token) session.token = tokenOverride;
  const cwd = path.resolve(session.repoPath);
  const remoteName = await getRemoteName(cwd);
  if (!remoteName) {
    throw new Error('This workspace has no remote to pull from');
  }
  if (!token) {
    throw new Error('Session token expired — please reload the page to re-authenticate');
  }

  const currentBranch = (await runGit(cwd, ['branch', '--show-current'])).stdout.trim() || session.defaultBranch || 'main';
  const pullResult = await runGit(cwd, ['pull', '--ff-only', remoteName, currentBranch], {
    token,
    needsRemote: true,
  });

  return {
    message: pullResult.stdout.trim() || pullResult.stderr.trim() || `Pulled ${remoteName}/${currentBranch}`,
    status: await getWorkspaceGitStatus(sessionId),
  };
};

export const pushWorkspaceBranch = async (sessionId, tokenOverride = null) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  const token = tokenOverride || session.token || null;
  if (tokenOverride && !session.token) session.token = tokenOverride;
  const cwd = path.resolve(session.repoPath);
  const remoteName = await getRemoteName(cwd);
  if (!remoteName) {
    throw new Error('This workspace has no remote to push to');
  }
  if (!token) {
    throw new Error('Session token expired — please reload the page to re-authenticate');
  }

  const currentBranch = (await runGit(cwd, ['branch', '--show-current'])).stdout.trim() || session.defaultBranch || 'main';
  const pushResult = await runGit(cwd, ['push', '-u', remoteName, currentBranch], {
    token,
    needsRemote: true,
    maxBuffer: 40 * 1024 * 1024,
  });

  return {
    branch: currentBranch,
    message: pushResult.stdout.trim() || pushResult.stderr.trim() || `Pushed ${remoteName}/${currentBranch}`,
    status: await getWorkspaceGitStatus(sessionId),
  };
};

// Valid git branch name: no whitespace, no control chars, no special git pathspec chars.
// Rejects '..' (ambiguous range), names starting/ending with '/', and common injection chars.
const VALID_BRANCH_RE = /^(?!.*\.\.)(?!.*\/\/)(?!\/)(?!.*\/$)[^\x00-\x1f\x7f ~^:?*\[\\]+$/;

export const switchWorkspaceBranch = async (sessionId, branchName, tokenOverride = null) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  const token = tokenOverride || session.token || null;
  if (tokenOverride && !session.token) session.token = tokenOverride;
  const cwd = path.resolve(session.repoPath);
  const nextBranch = String(branchName || '').trim();
  if (!nextBranch) {
    throw new Error('Branch name is required');
  }

  if (!VALID_BRANCH_RE.test(nextBranch)) {
    throw new Error(`Invalid branch name: "${nextBranch}"`);
  }

  const remoteName = await getRemoteName(cwd);
  const localExists = (await runGit(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${nextBranch}`], {
    allowFailure: true,
  })).code === 0;

  if (localExists) {
    await runGit(cwd, ['switch', nextBranch]);
  } else if (remoteName) {
    const remoteExists = (await runGit(cwd, ['show-ref', '--verify', '--quiet', `refs/remotes/${remoteName}/${nextBranch}`], {
      allowFailure: true,
    })).code === 0;

    if (!remoteExists) {
      const fetchResult = await runGit(cwd, ['fetch', '--prune', remoteName], {
        token,
        needsRemote: true,
        allowFailure: true,
      });
      if (fetchResult.code !== 0) {
        console.warn(`[git] fetch failed for remote "${remoteName}": ${fetchResult.stderr.trim()}`);
      }
    }

    const refreshedRemoteExists = (await runGit(cwd, ['show-ref', '--verify', '--quiet', `refs/remotes/${remoteName}/${nextBranch}`], {
      allowFailure: true,
    })).code === 0;

    if (refreshedRemoteExists) {
      await runGit(cwd, ['switch', '--track', '-c', nextBranch, `${remoteName}/${nextBranch}`]);
    } else {
      // Branch not found locally or on remote — create it as a new local branch
      await runGit(cwd, ['switch', '-c', nextBranch]);
    }
  } else {
    await runGit(cwd, ['switch', '-c', nextBranch]);
  }

  session.defaultBranch = session.defaultBranch || nextBranch;

  return getWorkspaceGitStatus(sessionId);
};

export const createWorkspacePullRequest = async (sessionId, payload, tokenOverride = null) => {
  const session = await ensureWorkspaceGitReady(sessionId);
  const token = tokenOverride || session.token || null;
  if (tokenOverride && !session.token) session.token = tokenOverride;
  if (!token) {
    throw new Error('Session token expired — please reload the page to re-authenticate');
  }

  const cwd = path.resolve(session.repoPath);
  const currentBranch = (await runGit(cwd, ['branch', '--show-current'])).stdout.trim();
  const base = String(payload.baseBranch || session.defaultBranch || 'main').trim();
  const title = String(payload.title || '').trim();

  if (!currentBranch) {
    throw new Error('Could not determine the current branch');
  }

  if (!title) {
    throw new Error('Pull request title is required');
  }

  if (currentBranch === base) {
    throw new Error('Switch to a feature branch before opening a pull request');
  }

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.pulls.create({
    owner: session.owner,
    repo: session.repo,
    title,
    body: payload.body || '',
    head: currentBranch,
    base,
  });

  return {
    number: data.number,
    url: data.html_url,
    title: data.title,
    branch: currentBranch,
    base,
  };
};
