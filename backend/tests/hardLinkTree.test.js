import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';

const { linkTree, breakHardLinks } = await import('../src/utils/hardLinkTree.js');

/**
 * A cache hit snapshots the cached build's output by hard-linking it. These tests pin down the
 * property that makes that safe: once a tree has been through breakHardLinks, writing to it in
 * place, the way the Docker build does, can no longer reach the tree it was linked from.
 */
describe('hard-link snapshots of build trees', () => {
  let root;
  let src;
  let dst;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'hardlink-'));
    src = path.join(root, 'src');
    dst = path.join(root, 'dst');
    await fs.mkdir(path.join(src, 'html', 'deep'), { recursive: true });
    await fs.writeFile(path.join(src, 'index.html'), 'index');
    await fs.writeFile(path.join(src, 'html', 'deep', 'eq.svg'), 'svg');
    await fs.chmod(path.join(src, 'index.html'), 0o640);
    await fs.symlink('index.html', path.join(src, 'link.html'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('links every file instead of copying it, and keeps symlinks as symlinks', async () => {
    await linkTree(src, dst);

    const a = await fs.stat(path.join(src, 'html', 'deep', 'eq.svg'));
    const b = await fs.stat(path.join(dst, 'html', 'deep', 'eq.svg'));
    assert.equal(a.ino, b.ino);
    assert.equal(await fs.readlink(path.join(dst, 'link.html')), 'index.html');
  });

  it('separates a linked tree so an in-place write does not reach the source', async () => {
    await linkTree(src, dst);

    assert.equal(await breakHardLinks(dst), 2);
    // An overwrite through the existing name truncates the file in place, like `cp` does.
    await fs.writeFile(path.join(dst, 'index.html'), 'rebuilt');

    assert.equal(await fs.readFile(path.join(src, 'index.html'), 'utf8'), 'index');
    assert.equal(await fs.readFile(path.join(dst, 'index.html'), 'utf8'), 'rebuilt');
    assert.equal((await fs.stat(path.join(dst, 'index.html'))).mode & 0o777, 0o640);
  });

  it('protects the snapshot when it is the source tree that gets rebuilt', async () => {
    await linkTree(src, dst);

    await breakHardLinks(src);
    await fs.writeFile(path.join(src, 'html', 'deep', 'eq.svg'), 'rebuilt');

    assert.equal(await fs.readFile(path.join(dst, 'html', 'deep', 'eq.svg'), 'utf8'), 'svg');
  });

  it('copies nothing in a tree that shares no files', async () => {
    assert.equal(await breakHardLinks(src), 0);
    assert.equal(await breakHardLinks(path.join(root, 'missing')), 0);
  });
});
