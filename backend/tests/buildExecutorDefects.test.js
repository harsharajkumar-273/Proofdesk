import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';

const { buildExecutor } = await import('../src/services/buildExecutor.js');

const SESSION_ID = 'abcdef0123456789';

describe('BuildExecutor regressions found by the Docker pipeline benchmark', () => {
  let repoPath;

  beforeEach(async () => {
    repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'be-defect-'));
    buildExecutor.sessions.set(SESSION_ID, {
      owner: 'o', repo: 'r', repoPath, outputPath: path.join(repoPath, 'out'), fromCache: false,
    });
  });

  afterEach(async () => {
    mock.restoreAll();
    buildExecutor.sessions.delete(SESSION_ID);
    buildExecutor.buildLogs.delete(SESSION_ID);
    buildExecutor.buildCache.delete('o/r');
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('updateFile marks the session as diverged from its commit and drops a cache entry built in its own directories', async () => {
    mock.method(buildExecutor, '_saveCache', async () => {});
    mock.method(buildExecutor, 'build', async () => ({ success: true }));
    buildExecutor.buildCache.set('o/r', { commitHash: 'abc', repoPath, outputPath: '', buildPath: '', sessionId: SESSION_ID, builtAt: 0, cacheVersion: 'x' });

    await buildExecutor.updateFile(SESSION_ID, 'a.txt', 'edited');

    assert.equal(buildExecutor.sessions.get(SESSION_ID).hasLocalEdits, true);
    assert.equal(buildExecutor.buildCache.has('o/r'), false);
  });

  it('updateFile keeps a cache entry that belongs to another session\'s directories', async () => {
    // One user's edit must not cost every later session a full rebuild: the
    // cached build is still exactly what its commit produces.
    const save = mock.method(buildExecutor, '_saveCache', async () => {});
    mock.method(buildExecutor, 'build', async () => ({ success: true }));
    const otherBase = await fs.mkdtemp(path.join(os.tmpdir(), 'be-defect-other-'));
    try {
      buildExecutor.buildCache.set('o/r', { commitHash: 'abc', repoPath: path.join(otherBase, 'repo'), outputPath: '', buildPath: '', sessionId: 'fedcba9876543210', builtAt: 0, cacheVersion: 'x' });

      await buildExecutor.updateFile(SESSION_ID, 'a.txt', 'edited');

      assert.equal(buildExecutor.sessions.get(SESSION_ID).hasLocalEdits, true);
      assert.equal(buildExecutor.buildCache.get('o/r')?.commitHash, 'abc');
      assert.equal(save.mock.callCount(), 0);
    } finally {
      await fs.rm(otherBase, { recursive: true, force: true });
    }
  });

  it('updateFile does not resolve with the previous build\'s finished result', async () => {
    mock.method(buildExecutor, '_saveCache', async () => {});
    let release;
    const gate = new Promise((r) => { release = r; });
    mock.method(buildExecutor, 'build', async () => { await gate; return { success: true, marker: 'new' }; });
    // A previous build already finished for this session.
    buildExecutor._initLog(SESSION_ID);
    buildExecutor._finishLog(SESSION_ID, { success: true, marker: 'old' });

    const pending = buildExecutor.updateFile(SESSION_ID, 'a.txt', 'edited');
    release();
    const result = await pending;

    assert.equal(result.marker, 'new');
  });

  it('a cache-hit snapshot shares the build output until the session builds', async () => {
    const source = path.join(repoPath, 'cached');
    await fs.mkdir(path.join(source, 'repo'), { recursive: true });
    await fs.mkdir(path.join(source, 'output'), { recursive: true });
    await fs.mkdir(path.join(source, 'build'), { recursive: true });
    await fs.writeFile(path.join(source, 'repo', 'book.ptx'), 'source');
    await fs.writeFile(path.join(source, 'output', 'index.html'), 'cached');

    const snap = await buildExecutor._copyWorkspaceSnapshot(
      path.join(source, 'repo'), path.join(source, 'output'), path.join(source, 'build'), path.join(repoPath, 'snap')
    );

    const cachedFile = path.join(source, 'output', 'index.html');
    const snapFile = path.join(snap.outputPath, 'index.html');
    assert.equal((await fs.stat(snapFile)).ino, (await fs.stat(cachedFile)).ino);
    // The repo takes edits directly, so it is never shared.
    assert.notEqual(
      (await fs.stat(path.join(snap.repoPath, 'book.ptx'))).ino,
      (await fs.stat(path.join(source, 'repo', 'book.ptx'))).ino
    );

    await buildExecutor._privatizeBuildTrees({ owner: 'o', repo: 'r', ...snap });
    await fs.writeFile(snapFile, 'rebuilt');
    assert.equal(await fs.readFile(cachedFile, 'utf8'), 'cached');
  });

  it('cleanup stops the session container even when the directory stays in the build cache', async () => {
    const stop = mock.method(buildExecutor, '_stopPersistentContainer', async () => {});
    buildExecutor.buildCache.set('o/r', { commitHash: 'abc', repoPath: path.join(repoPath, 'repo'), outputPath: '', buildPath: '', sessionId: SESSION_ID, builtAt: 0, cacheVersion: 'x' });
    buildExecutor.sessions.get(SESSION_ID).repoPath = path.join(repoPath, 'repo');

    await buildExecutor.cleanup(SESSION_ID);

    assert.equal(stop.mock.callCount(), 1);
    assert.equal(buildExecutor.sessions.has(SESSION_ID), false);
  });
});
