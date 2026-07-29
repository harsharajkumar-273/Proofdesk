export interface Repository {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

export interface TeamSessionData {
  code: string;
  repo: Repository;
  hostName?: string;
  hostLogin?: string;
  createdAt?: number;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Validates a parsed value as a Repository, returning null if it isn't one.
 *
 * The previous checks tested truthiness rather than type — `!parsed?.owner`
 * rejects '' and undefined but accepts `true`, `42` or `{}`. Anything stored
 * under those keys was then handed back typed as a Repository, and the first
 * consumer to call a string method on it threw. sessionStorage is writable by
 * any script on the origin and survives reloads, so a single bad value wedged
 * the app on every subsequent load until storage was cleared by hand.
 */
const parseRepository = (value: unknown): Repository | null => {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Record<string, unknown>;
  if (
    !isNonEmptyString(candidate.owner) ||
    !isNonEmptyString(candidate.name) ||
    !isNonEmptyString(candidate.fullName)
  ) {
    return null;
  }

  return {
    owner: candidate.owner,
    name: candidate.name,
    fullName: candidate.fullName,
    defaultBranch: isNonEmptyString(candidate.defaultBranch) ? candidate.defaultBranch : 'main',
  };
};

export const getSelectedRepo = (): Repository | null => {
  try {
    const raw = sessionStorage.getItem('selectedRepo');
    if (!raw) return null;
    return parseRepository(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const setSelectedRepo = (repo: Repository | null): void => {
  if (repo) {
    sessionStorage.setItem('selectedRepo', JSON.stringify(repo));
  } else {
    sessionStorage.removeItem('selectedRepo');
  }
};

export const getTeamSession = (): TeamSessionData | null => {
  try {
    const raw = sessionStorage.getItem('teamSession');
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const candidate = parsed as Record<string, unknown>;
    if (!isNonEmptyString(candidate.code)) return null;

    // The nested repo went through even less checking than the outer object:
    // only repo.fullName was tested, while repo.owner and repo.name were copied
    // out unexamined. Reusing parseRepository holds all three to one standard.
    const repo = parseRepository(candidate.repo);
    if (!repo) return null;

    return {
      code: candidate.code,
      repo,
      hostName: isNonEmptyString(candidate.hostName) ? candidate.hostName : undefined,
      hostLogin: isNonEmptyString(candidate.hostLogin) ? candidate.hostLogin : undefined,
      createdAt: typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
        ? candidate.createdAt
        : undefined,
    };
  } catch {
    return null;
  }
};

export const setTeamSession = (session: TeamSessionData | null): void => {
  if (session) {
    sessionStorage.setItem('teamSession', JSON.stringify(session));
  } else {
    sessionStorage.removeItem('teamSession');
  }
};

export const clearSessionStorage = (): void => {
  sessionStorage.removeItem('selectedRepo');
  sessionStorage.removeItem('teamSession');
};
