export interface RecentFileEntry {
  path: string;
  name: string;
  openedAt: string;
}

export type ReviewMarkerStatus = 'needs-review' | 'changes-requested' | 'verify-preview' | 'approved' | 'ready';

export interface ReviewCommentEntry {
  id: string;
  author: string;
  message: string;
  createdAt: string;
}

export interface ReviewThreadEntry {
  id: string;
  lineNumber: number;
  status: 'open' | 'resolved';
  comments: ReviewCommentEntry[];
  updatedAt: string;
}

export interface ReviewMarkerEntry {
  path: string;
  status: ReviewMarkerStatus;
  note: string;
  updatedAt: string;
  threads?: ReviewThreadEntry[];
}

interface PreviewArtifact {
  path: string;
  type?: string;
}

const RECENT_FILES_LIMIT = 8;

const getWorkspaceStorageKey = (repoFullName: string | null, suffix: string) => {
  if (!repoFullName) return null;
  return `mra:${repoFullName}:${suffix}`;
};

const readJson = <T>(storageKey: string | null, fallback: T) => {
  if (!storageKey || typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (storageKey: string | null, value: unknown) => {
  if (!storageKey || typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(value));
};

export const readRecentFiles = (repoFullName: string | null) =>
  readJson<RecentFileEntry[]>(getWorkspaceStorageKey(repoFullName, 'recent-files'), []);

export const pushRecentFile = (repoFullName: string | null, entry: { path: string; name: string }) => {
  const storageKey = getWorkspaceStorageKey(repoFullName, 'recent-files');
  const current = readRecentFiles(repoFullName).filter((item) => item.path !== entry.path);
  const next = [{ ...entry, openedAt: new Date().toISOString() }, ...current].slice(0, RECENT_FILES_LIMIT);
  writeJson(storageKey, next);
  return next;
};

export const readReviewMarkers = (repoFullName: string | null) =>
  readJson<Record<string, ReviewMarkerEntry>>(getWorkspaceStorageKey(repoFullName, 'review-markers'), {});

export const upsertReviewMarker = (
  repoFullName: string | null,
  marker: { path: string; status: ReviewMarkerStatus; note: string; threads?: ReviewThreadEntry[] }
) => {
  const storageKey = getWorkspaceStorageKey(repoFullName, 'review-markers');
  const current = readReviewMarkers(repoFullName);
  const next = {
    ...current,
    [marker.path]: {
      ...marker,
      updatedAt: new Date().toISOString(),
    },
  };
  writeJson(storageKey, next);
  return next;
};

export const removeReviewMarker = (repoFullName: string | null, filePath: string) => {
  const storageKey = getWorkspaceStorageKey(repoFullName, 'review-markers');
  const current = readReviewMarkers(repoFullName);
  if (!current[filePath]) return current;

  const next = { ...current };
  delete next[filePath];
  writeJson(storageKey, next);
  return next;
};

const getFileStem = (filePath: string) => {
  const fileName = filePath.split('/').pop() || filePath;
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(0, lastDot) : fileName;
};

export const resolvePreviewTarget = ({
  activeFilePath,
  previewEntryFile,
  artifacts = [],
}: {
  activeFilePath?: string | null;
  previewEntryFile?: string | null;
  artifacts?: PreviewArtifact[];
}) => {
  if (!activeFilePath) return previewEntryFile || null;

  const lowerPath = activeFilePath.toLowerCase();
  if (lowerPath.endsWith('.html') || lowerPath.endsWith('.htm')) {
    return activeFilePath;
  }

  const htmlArtifacts = artifacts
    .filter((artifact) => artifact.path?.toLowerCase().endsWith('.html'))
    .map((artifact) => artifact.path);

  if (htmlArtifacts.length === 0) {
    return previewEntryFile || null;
  }

  const stem = getFileStem(activeFilePath).toLowerCase();
  const exactStemMatch = htmlArtifacts.find((artifactPath) => getFileStem(artifactPath).toLowerCase() === stem);
  if (exactStemMatch) return exactStemMatch;

  const partialStemMatch = htmlArtifacts.find((artifactPath) => artifactPath.toLowerCase().includes(stem));
  if (partialStemMatch) return partialStemMatch;

  return previewEntryFile || htmlArtifacts[0] || null;
};

export const getReviewMarkerLabel = (status: ReviewMarkerStatus) => {
  switch (status) {
    case 'needs-review':
      return 'Needs review';
    case 'changes-requested':
      return 'Changes requested';
    case 'verify-preview':
      return 'Verify preview';
    case 'approved':
    case 'ready':
      return 'Approved';
    default:
      return 'Review';
  }
};
