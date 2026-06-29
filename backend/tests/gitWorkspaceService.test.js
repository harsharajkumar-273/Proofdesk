import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';

const buildExecutor = (await import('../src/services/buildExecutor.js')).default;
const {
  ensureWorkspaceGitReady,
  getWorkspaceCommitHistory,
  getWorkspaceFileDiffAtCommit,
  rollbackWorkspaceFileToCommit,
} = await import('../src/services/gitWorkspaceService.js');

describe('Git Workspace Service (Delta Time Travel)', () => {
  const sessionId = '1234567890abcdef';
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const tempRepoPath = path.resolve(__dirname, 'temp-git-test-repo');
  const testFilePath = path.join(tempRepoPath, 'hello.txt');

  before(async () => {
    // Create clean directory
    await fs.rm(tempRepoPath, { recursive: true, force: true });
    await fs.mkdir(tempRepoPath, { recursive: true });

    // Seed file
    await fs.writeFile(testFilePath, 'Initial content\n', 'utf-8');

    // Register session
    buildExecutor.sessions.set(sessionId, {
      id: sessionId,
      owner: 'test-owner',
      repo: 'test-repo',
      repoPath: tempRepoPath,
      defaultBranch: 'main',
    });
  });

  after(async () => {
    // Clean up session and temp dir
    buildExecutor.sessions.delete(sessionId);
    await fs.rm(tempRepoPath, { recursive: true, force: true });
  });

  it('initializes git and makes the initial commit', async () => {
    await ensureWorkspaceGitReady(sessionId);

    // Verify .git exists
    const gitDirExists = await fs.access(path.join(tempRepoPath, '.git'))
      .then(() => true)
      .catch(() => false);
    assert.ok(gitDirExists, 'Git folder should be initialized');

    // Verify history has at least 1 commit
    const commits = await getWorkspaceCommitHistory(sessionId);
    assert.ok(commits.length >= 1, 'Should have at least initial commit');
    assert.equal(commits[0].subject, 'Initial workspace snapshot');
    assert.ok(commits[0].files.includes('hello.txt'), 'Initial commit should track hello.txt');
  });

  it('can trace commits and fetch file diffs', async () => {
    // Modify file
    await fs.writeFile(testFilePath, 'Initial content\nLine 2 updated\n', 'utf-8');

    // Commit change manually using git Workspace service helpers
    const { stageWorkspaceFile, commitWorkspaceChanges } = await import('../src/services/gitWorkspaceService.js');
    await stageWorkspaceFile(sessionId, 'hello.txt');
    const commitRes = await commitWorkspaceChanges(sessionId, 'Second commit message');

    assert.ok(commitRes.commitSha);

    // Check history
    const commits = await getWorkspaceCommitHistory(sessionId);
    assert.equal(commits.length, 2);
    assert.equal(commits[0].subject, 'Second commit message');

    // Get diff
    const diffRes = await getWorkspaceFileDiffAtCommit(sessionId, commits[0].hash, 'hello.txt');
    assert.ok(diffRes.diff.includes('+Line 2 updated'), 'Diff should include addition of Line 2');
  });

  it('can roll back file content to a specific commit', async () => {
    const commits = await getWorkspaceCommitHistory(sessionId);
    // There should be 2 commits. Let's roll back to the first one (commits[1].hash)
    const initialCommitSha = commits[1].hash;

    await rollbackWorkspaceFileToCommit(sessionId, initialCommitSha, 'hello.txt');

    // Verify content reverted
    const content = await fs.readFile(testFilePath, 'utf-8');
    assert.equal(content, 'Initial content\n');
  });
});
