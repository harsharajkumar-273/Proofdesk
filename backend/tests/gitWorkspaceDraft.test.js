import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';

const execFileAsync = promisify(execFile);

const buildExecutor = (await import('../src/services/buildExecutor.js')).default;
const { ensureWorkspaceGitReady, saveWorkspaceDraft } = await import(
  '../src/services/gitWorkspaceService.js'
);

/**
 * The draft auto-save writes a commit to `drafts/<username>` using git
 * plumbing, deliberately without switching branches. These tests pin the
 * property that matters: the author's checkout is left exactly as it was.
 */
describe('Git Workspace Service (draft auto-save)', () => {
  const sessionId = 'fedcba9876543210';
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoPath = path.resolve(__dirname, 'temp-draft-test-repo');

  const git = async (...args) => {
    const { stdout } = await execFileAsync('git', args, { cwd: repoPath });
    return stdout.trim();
  };

  before(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(path.join(repoPath, 'a.txt'), 'original\n', 'utf-8');

    buildExecutor.sessions.set(sessionId, {
      id: sessionId,
      owner: 'test-owner',
      repo: 'test-repo',
      repoPath,
      defaultBranch: 'main',
    });

    await ensureWorkspaceGitReady(sessionId);
  });

  after(async () => {
    buildExecutor.sessions.delete(sessionId);
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('writes a draft commit on the drafts/<username> branch', async () => {
    await fs.writeFile(path.join(repoPath, 'a.txt'), 'edited\n', 'utf-8');

    const result = await saveWorkspaceDraft(sessionId, 'SakethSumanBathini');

    assert.equal(result.saved, true);
    assert.equal(result.branch, 'drafts/sakethsumanbathini');
    assert.ok(result.commitSha);

    const tip = await git('rev-parse', 'refs/heads/drafts/sakethsumanbathini');
    assert.equal(tip, result.commitSha);
  });

  it('captures the working tree content in the draft', async () => {
    const content = await git('show', 'refs/heads/drafts/sakethsumanbathini:a.txt');
    assert.equal(content, 'edited');
  });

  it('leaves HEAD, the branch, the index and the worktree untouched', async () => {
    await fs.writeFile(path.join(repoPath, 'unstaged.txt'), 'loose\n', 'utf-8');
    await fs.writeFile(path.join(repoPath, 'staged.txt'), 'ready\n', 'utf-8');
    await git('add', 'staged.txt');

    const beforeHead = await git('rev-parse', 'HEAD');
    const beforeBranch = await git('rev-parse', '--abbrev-ref', 'HEAD');
    const beforeIndex = await git('write-tree');
    const beforeStatus = await git('status', '--porcelain');

    await saveWorkspaceDraft(sessionId, 'tester');

    assert.equal(await git('rev-parse', 'HEAD'), beforeHead, 'HEAD moved');
    assert.equal(await git('rev-parse', '--abbrev-ref', 'HEAD'), beforeBranch, 'branch changed');
    assert.equal(await git('write-tree'), beforeIndex, 'index changed');
    assert.equal(await git('status', '--porcelain'), beforeStatus, 'worktree changed');
  });

  it('includes untracked and unstaged files in the draft', async () => {
    const files = await git('ls-tree', '-r', '--name-only', 'refs/heads/drafts/tester');
    const list = files.split('\n');
    assert.ok(list.includes('unstaged.txt'), 'untracked file missing from draft');
    assert.ok(list.includes('staged.txt'), 'staged file missing from draft');
  });

  it('does not leak its temporary index into the draft commit', async () => {
    const files = await git('ls-tree', '-r', '--name-only', 'refs/heads/drafts/tester');
    assert.ok(
      !files.split('\n').some((f) => f.includes('proofdesk-draft-index')),
      'temporary index was committed into the draft',
    );
  });

  it('skips the commit when nothing has changed since the last draft', async () => {
    const first = await saveWorkspaceDraft(sessionId, 'idle-author');
    assert.equal(first.saved, true);

    const second = await saveWorkspaceDraft(sessionId, 'idle-author');
    assert.equal(second.saved, false);
    assert.equal(second.reason, 'unchanged');
    assert.equal(second.commitSha, first.commitSha);
  });

  it('chains each draft onto the previous one', async () => {
    await fs.writeFile(path.join(repoPath, 'a.txt'), 'first pass\n', 'utf-8');
    const first = await saveWorkspaceDraft(sessionId, 'chain-author');

    await fs.writeFile(path.join(repoPath, 'a.txt'), 'second pass\n', 'utf-8');
    const second = await saveWorkspaceDraft(sessionId, 'chain-author');

    assert.notEqual(second.commitSha, first.commitSha);
    const parent = await git('rev-parse', `${second.commitSha}^`);
    assert.equal(parent, first.commitSha, 'draft did not chain onto the previous draft');
  });

  it('sanitises a username into a safe branch name', async () => {
    const result = await saveWorkspaceDraft(sessionId, 'Odd Name/With..Chars');
    assert.equal(result.branch, 'drafts/odd-name-with-chars');
  });

  it('never produces a ref git would reject', async () => {
    // Consecutive dots are the trap: git refuses any ref containing "..",
    // so the sanitiser must not let them survive.
    for (const name of ['a..b', 'foo.bar', 'user name', '-lead-', 'trail-']) {
      const result = await saveWorkspaceDraft(sessionId, name);
      assert.ok(!result.branch.includes('..'), `${name} produced ".." in ${result.branch}`);
      assert.ok(!result.branch.includes(' '), `${name} produced a space`);
      assert.match(result.branch, /^drafts\/[a-z0-9_-]+$/);
      assert.ok(!/[-_]$/.test(result.branch), `${name} left a trailing separator`);
    }
  });

  it('rejects a username that sanitises to nothing', async () => {
    await assert.rejects(() => saveWorkspaceDraft(sessionId, '///'), /username is required/i);
    await assert.rejects(() => saveWorkspaceDraft(sessionId, ''), /username is required/i);
  });

  it('does not disturb the draft branch of a different author', async () => {
    const before = await git('rev-parse', 'refs/heads/drafts/tester');
    await fs.writeFile(path.join(repoPath, 'a.txt'), 'someone else edits\n', 'utf-8');
    await saveWorkspaceDraft(sessionId, 'another-author');
    const after = await git('rev-parse', 'refs/heads/drafts/tester');
    assert.equal(after, before);
  });
});
