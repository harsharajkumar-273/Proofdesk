import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

process.env.NODE_ENV = 'test';

const {
  resolveContainedPath,
  resolveContainedPathLexical,
  PathContainmentError,
} = await import('../src/utils/pathContainment.js');

/**
 * Regression tests for the path traversal reported in issue #50.
 *
 * These reproduce the two ways a caller-supplied path can escape a session's
 * repository, and assert both are refused. The symlink case is the one a
 * purely lexical check misses: repositories are cloned from GitHub and git
 * records symlinks, so a repository can contain `escape -> /etc` and
 * "escape/passwd" then resolves inside the repo while the write follows the
 * link out of it.
 */
describe('path containment (issue #50)', () => {
  let root;
  let repo;
  let outside;

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'proofdesk-containment-'));
    repo = path.join(root, 'repo');
    outside = path.join(root, 'outside');
    await fs.mkdir(path.join(repo, 'src'), { recursive: true });
    await fs.mkdir(outside, { recursive: true });

    await fs.writeFile(path.join(repo, 'chapter.xml'), '<p>ok</p>', 'utf-8');
    await fs.writeFile(path.join(outside, 'secret.txt'), 'SECRET', 'utf-8');

    // A sibling directory whose name shares a prefix with the repo, to catch
    // a containment check that compares without a trailing separator.
    await fs.mkdir(`${repo}-evil`, { recursive: true });
    await fs.writeFile(path.join(`${repo}-evil`, 'x.txt'), 'evil', 'utf-8');
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const denied = async (relativePath, label) => {
    await assert.rejects(
      () => resolveContainedPath(repo, relativePath),
      (error) => error instanceof PathContainmentError,
      label ?? `expected "${relativePath}" to be denied`,
    );
  };

  describe('legitimate paths are still allowed', () => {
    it('accepts a file at the repository root', async () => {
      const resolved = await resolveContainedPath(repo, 'chapter.xml');
      assert.equal(resolved, path.join(repo, 'chapter.xml'));
    });

    it('accepts a nested file', async () => {
      const resolved = await resolveContainedPath(repo, 'src/new.xml');
      assert.equal(resolved, path.join(repo, 'src', 'new.xml'));
    });

    it('accepts a file that does not exist yet', async () => {
      const resolved = await resolveContainedPath(repo, 'src/deep/newer.xml');
      assert.equal(resolved, path.join(repo, 'src', 'deep', 'newer.xml'));
    });

    it('accepts an inner traversal that stays inside', async () => {
      const resolved = await resolveContainedPath(repo, 'src/../chapter.xml');
      assert.equal(resolved, path.join(repo, 'chapter.xml'));
    });

    it('accepts a base path with a trailing separator', async () => {
      const resolved = await resolveContainedPath(`${repo}${path.sep}`, 'chapter.xml');
      assert.equal(resolved, path.join(repo, 'chapter.xml'));
    });

    it('accepts an unnormalised base path', async () => {
      const resolved = await resolveContainedPath(path.join(repo, '.'), 'chapter.xml');
      assert.equal(resolved, path.join(repo, 'chapter.xml'));
    });
  });

  describe('traversal in the path is refused', () => {
    it('refuses the exact payload from the report', async () => {
      await denied('../../../package.json');
    });

    it('refuses a single level of traversal', async () => {
      await denied('../outside/secret.txt');
    });

    it('refuses traversal buried mid-path', async () => {
      await denied('src/../../outside/secret.txt');
    });

    it('refuses an absolute path', async () => {
      await denied(path.join(outside, 'secret.txt'));
    });

    it('refuses a sibling directory sharing the repository prefix', async () => {
      await denied(`../${path.basename(repo)}-evil/x.txt`);
    });

    it('refuses the repository directory itself', async () => {
      await denied('.');
    });

    it('refuses an empty or whitespace path', async () => {
      await denied('');
      await denied('   ');
    });

    it('refuses a path containing a NUL byte', async () => {
      // A NUL truncates at the syscall boundary, so a path can validate as one
      // thing and open another.
      await denied('chapter.xml\u0000/../../outside/secret.txt');
    });

    it('refuses a non-string path', async () => {
      await assert.rejects(
        () => resolveContainedPath(repo, undefined),
        (error) => error instanceof PathContainmentError,
      );
    });
  });

  describe('traversal through a symlink is refused', () => {
    let symlinksSupported = true;

    before(async () => {
      try {
        await fs.symlink(outside, path.join(repo, 'escape'), 'dir');
        await fs.symlink(path.join(outside, 'secret.txt'), path.join(repo, 'linked.txt'), 'file');
      } catch {
        // Windows needs elevation or developer mode for symlinks; skip rather
        // than fail the suite on a machine that cannot create them.
        symlinksSupported = false;
      }
    });

    it('refuses writing through a symlinked directory inside the repo', async (t) => {
      if (!symlinksSupported) return t.skip('symlinks unavailable on this host');
      await denied('escape/secret.txt', 'symlinked directory was not blocked');
    });

    it('refuses writing to a file that is itself a symlink out of the repo', async (t) => {
      if (!symlinksSupported) return t.skip('symlinks unavailable on this host');
      await denied('linked.txt', 'symlinked file was not blocked');
    });

    it('leaves the file outside the repository untouched', async (t) => {
      if (!symlinksSupported) return t.skip('symlinks unavailable on this host');
      const content = await fs.readFile(path.join(outside, 'secret.txt'), 'utf-8');
      assert.equal(content, 'SECRET');
    });

    it('demonstrates that a lexical check alone would have allowed it', async (t) => {
      if (!symlinksSupported) return t.skip('symlinks unavailable on this host');
      // This is the crux of the finding: the lexical check passes, which is
      // why the realpath step exists.
      const lexical = resolveContainedPathLexical(repo, 'escape/secret.txt');
      assert.equal(lexical, path.join(repo, 'escape', 'secret.txt'));
      await denied('escape/secret.txt');
    });
  });

  describe('resolveContainedPathLexical', () => {
    it('resolves a legitimate path', () => {
      assert.equal(
        resolveContainedPathLexical(repo, 'chapter.xml'),
        path.join(repo, 'chapter.xml'),
      );
    });

    it('throws on traversal', () => {
      assert.throws(
        () => resolveContainedPathLexical(repo, '../../../package.json'),
        (error) => error instanceof PathContainmentError,
      );
    });

    it('throws on a NUL byte', () => {
      assert.throws(
        () => resolveContainedPathLexical(repo, 'a\u0000b'),
        (error) => error instanceof PathContainmentError,
      );
    });
  });
});
