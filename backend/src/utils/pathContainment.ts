import fs from 'fs/promises';
import path from 'path';

/**
 * Path containment guard for user-supplied file paths.
 *
 * Anywhere a caller-supplied relative path is joined onto a session's
 * repository directory, the result must be proven to stay inside that
 * directory before it is opened for reading or writing.
 *
 * Two distinct escapes have to be blocked, and a purely lexical check only
 * stops the first:
 *
 *  1. Traversal in the path itself — "../../../package.json", or an absolute
 *     path like "/etc/passwd". `path.resolve` collapses these, so comparing
 *     the resolved target against the resolved base catches them.
 *
 *  2. Traversal through a symlink that lives inside the repository. A
 *     repository is cloned from GitHub and git records symlinks, so its
 *     contents are attacker-controlled: committing `escape -> /etc` makes
 *     "escape/passwd" resolve to a path that is lexically inside the repo
 *     while the write follows the link straight out of it. `path.resolve`
 *     never touches the filesystem, so no amount of string comparison sees
 *     this. The only way to catch it is to ask the filesystem, which is what
 *     the realpath step below does.
 *
 * The realpath check walks up to the deepest ancestor of the target that
 * actually exists, because the target itself is usually a file being created.
 * Resolving that ancestor covers both a symlinked parent directory and a
 * target file that is itself a symlink.
 */

/** Raised when a path would escape its repository. */
export class PathContainmentError extends Error {
  constructor(message: string = 'Access denied') {
    super(message);
    this.name = 'PathContainmentError';
  }
}

/**
 * Lexical containment only — no filesystem access.
 *
 * Exported separately because it is synchronous and useful for validating a
 * path before any I/O. It is **not sufficient on its own**: see
 * `resolveContainedPath` for the symlink case.
 */
export const resolveContainedPathLexical = (
  basePath: string,
  relativePath: string,
): string => {
  if (typeof relativePath !== 'string') {
    throw new PathContainmentError();
  }

  // A NUL byte truncates the path at the syscall boundary, so "a\0../../x"
  // can validate as one path and open another.
  if (relativePath.includes('\0') || basePath.includes('\0')) {
    throw new PathContainmentError();
  }

  if (relativePath.trim() === '') {
    throw new PathContainmentError();
  }

  // Both sides are resolved. Comparing against an unresolved base breaks the
  // moment the base carries a trailing separator or a "." segment, which
  // would reject perfectly legitimate paths.
  const base = path.resolve(basePath);
  const target = path.resolve(base, relativePath);

  // The trailing separator matters: without it "/data/repo-evil" would count
  // as being inside "/data/repo".
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new PathContainmentError();
  }

  return target;
};

/** Walks up from `candidate` to the deepest ancestor that exists on disk. */
const deepestExistingAncestor = async (candidate: string): Promise<string> => {
  let current = candidate;
  for (;;) {
    try {
      await fs.lstat(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      // Reached the filesystem root without finding anything that exists.
      if (parent === current) return current;
      current = parent;
    }
  }
};

/**
 * Resolves `relativePath` against `basePath` and proves the result stays
 * inside it, including through symlinks.
 *
 * Returns the absolute path to use. Throws `PathContainmentError` otherwise.
 *
 * `allowBaseItself` controls whether the base directory is an acceptable
 * result; it defaults to false because a caller resolving a *file* path
 * should never be handed the directory.
 */
export const resolveContainedPath = async (
  basePath: string,
  relativePath: string,
  options: { allowBaseItself?: boolean } = {},
): Promise<string> => {
  const target = resolveContainedPathLexical(basePath, relativePath);
  const base = path.resolve(basePath);

  if (!options.allowBaseItself && target === base) {
    throw new PathContainmentError();
  }

  // Resolve the base through any symlinks so both sides are compared in the
  // same terms. A missing base is a caller error, not an attack.
  let realBase: string;
  try {
    realBase = await fs.realpath(base);
  } catch {
    throw new PathContainmentError('Repository path is unavailable');
  }

  const anchor = await deepestExistingAncestor(target);
  let realAnchor: string;
  try {
    realAnchor = await fs.realpath(anchor);
  } catch {
    throw new PathContainmentError();
  }

  if (realAnchor !== realBase && !realAnchor.startsWith(realBase + path.sep)) {
    throw new PathContainmentError();
  }

  return target;
};
