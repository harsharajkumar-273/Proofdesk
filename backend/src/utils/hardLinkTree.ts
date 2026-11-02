/**
 * Copy-on-write snapshots of build trees, built from hard links.
 *
 * A cache hit used to copy the cached build's output and SCons build trees in
 * full (200–400 MB) before the session could open. Hard-linking them makes the
 * snapshot cost one link per file instead, and the space is shared until
 * somebody writes.
 *
 * The catch is that a hard link is the same file, so a write through either
 * name changes both. The Docker build overwrites files in place (`cp` onto an
 * existing file truncates it), so any session about to run Docker into a tree
 * must first call `breakHardLinks` on it. That includes the session whose build
 * was cached: its files are shared too once another session has linked them.
 */

import fs from 'fs/promises';
import path from 'path';

// Errors that mean "these two paths cannot share an inode", rather than that
// something is wrong with the source: another filesystem, a filesystem without
// hard links, or a file already at its link limit. The file is copied instead.
const LINK_FALLBACK_CODES = new Set(['EXDEV', 'EPERM', 'EMLINK', 'ENOTSUP', 'EOPNOTSUPP']);

/** Recreate `src` at `dst`, hard-linking every regular file. `dst` must not exist yet. */
export const linkTree = async (src: string, dst: string): Promise<void> => {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);

    if (entry.isDirectory()) {
      await linkTree(from, to);
    } else if (entry.isSymbolicLink()) {
      await fs.symlink(await fs.readlink(from), to);
    } else if (entry.isFile()) {
      try {
        await fs.link(from, to);
      } catch (err: any) {
        if (!LINK_FALLBACK_CODES.has(err.code)) throw err;
        await fs.copyFile(from, to);
      }
    }
  }
};

/**
 * Give every file under `dir` that shares its inode a private copy, so a write
 * to it can no longer reach another session's tree. Files with a single link,
 * which is all of them in a tree nobody has snapshotted, cost one `lstat`.
 *
 * The copy is written beside the file and renamed over it, so a reader never
 * sees a partly written file. Returns the number of files copied.
 */
export const breakHardLinks = async (dir: string): Promise<number> => {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err: any) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  let copied = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      copied += await breakHardLinks(full);
      continue;
    }
    if (!entry.isFile()) continue;

    const stat = await fs.lstat(full);
    if (stat.nlink < 2) continue;

    const tmp = `${full}.unlink-${process.pid}-${Date.now()}`;
    try {
      await fs.copyFile(full, tmp);
      await fs.chmod(tmp, stat.mode & 0o7777);
      await fs.rename(tmp, full);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
    copied += 1;
  }
  return copied;
};
