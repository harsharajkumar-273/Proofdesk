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

export const getSelectedRepo = (): Repository | null => {
  try {
    const raw = sessionStorage.getItem('selectedRepo');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.owner || !parsed?.name || !parsed?.fullName) return null;
    return {
      owner: parsed.owner,
      name: parsed.name,
      fullName: parsed.fullName,
      defaultBranch: parsed.defaultBranch || 'main',
    };
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
    if (!parsed?.code || !parsed?.repo?.fullName) return null;
    return {
      code: parsed.code,
      repo: {
        owner: parsed.repo.owner,
        name: parsed.repo.name,
        fullName: parsed.repo.fullName,
        defaultBranch: parsed.repo.defaultBranch || 'main',
      },
      hostName: parsed.hostName,
      hostLogin: parsed.hostLogin,
      createdAt: parsed.createdAt,
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
