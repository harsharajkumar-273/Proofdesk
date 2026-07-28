/**
 * Validation for GitHub owner and repository names.
 *
 * These two strings arrive from request bodies and end up inside `git` invocations. Until they are
 * checked, they are attacker-controlled text heading for a subprocess, so this module exists to be
 * the one place that decides what a legal identifier looks like.
 *
 * The rules are deliberately tighter than "characters GitHub happens to accept", because the goal is
 * not to mirror GitHub's namespace — it is to guarantee that whatever passes through here cannot
 * change the meaning of a command line or a URL. Anything rejected here is a name that could not
 * have resolved to a real repository anyway.
 */

/** Thrown when an owner or repository name is not safe to use. */
export class InvalidRepoIdentifierError extends Error {
  public readonly field: 'owner' | 'repo';

  constructor(field: 'owner' | 'repo', reason: string) {
    super(`Invalid ${field}: ${reason}`);
    this.name = 'InvalidRepoIdentifierError';
    this.field = field;
  }
}

/**
 * Characters permitted in either identifier.
 *
 * No whitespace, no quotes, no shell metacharacters, no path separators, no percent signs. The
 * anchors matter as much as the class: an unanchored pattern would accept `ok"; id #` because it
 * finds `ok` somewhere inside.
 */
export const REPO_IDENTIFIER_PATTERN = /^[A-Za-z0-9_.-]+$/;

/** GitHub caps logins at 39 characters and repository names at 100. */
const MAX_OWNER_LENGTH = 39;
const MAX_REPO_LENGTH = 100;

/**
 * Names that are structurally dangerous despite matching the character class.
 *
 * `.` and `..` pass `/^[A-Za-z0-9_.-]+$/` — the regex named in the issue would let both through —
 * yet they are path segments rather than names. Interpolated into
 * `https://github.com/${owner}/${repo}.git` they walk the URL path upwards, so `owner: '..'` points
 * the clone at a different location entirely. They can never name a real repository, so refusing
 * them costs nothing.
 */
const RESERVED_SEGMENTS = new Set(['.', '..']);

const validate = (field: 'owner' | 'repo', value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') {
    throw new InvalidRepoIdentifierError(field, 'must be a string');
  }

  // Compared against the raw value on purpose. Trimming first would silently accept
  // `"  repo\n; id"`, and a name with surrounding whitespace is not the name it looks like.
  if (value.length === 0) {
    throw new InvalidRepoIdentifierError(field, 'must not be empty');
  }

  if (value.length > maxLength) {
    throw new InvalidRepoIdentifierError(field, `must be at most ${maxLength} characters`);
  }

  if (!REPO_IDENTIFIER_PATTERN.test(value)) {
    throw new InvalidRepoIdentifierError(
      field,
      'may only contain letters, digits, hyphens, underscores and dots'
    );
  }

  if (RESERVED_SEGMENTS.has(value)) {
    throw new InvalidRepoIdentifierError(field, 'must not be a path segment');
  }

  return value;
};

/** Validate an owner (user or organisation) name, returning it unchanged. */
export const assertValidOwner = (owner: unknown): string => validate('owner', owner, MAX_OWNER_LENGTH);

/** Validate a repository name, returning it unchanged. */
export const assertValidRepo = (repo: unknown): string => validate('repo', repo, MAX_REPO_LENGTH);

/**
 * Validate both halves of a repository reference.
 *
 * Returns the pair so a caller can use the checked values rather than the originals, which keeps a
 * validated string and an unvalidated one from being easy to mix up at the call site.
 */
export const assertValidRepoIdentifier = (
  owner: unknown,
  repo: unknown
): { owner: string; repo: string } => ({
  owner: assertValidOwner(owner),
  repo: assertValidRepo(repo),
});

/** Whether a pair is valid, for callers that want a boolean rather than an exception. */
export const isValidRepoIdentifier = (owner: unknown, repo: unknown): boolean => {
  try {
    assertValidRepoIdentifier(owner, repo);
    return true;
  } catch {
    return false;
  }
};
