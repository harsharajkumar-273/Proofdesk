/**
 * Background draft auto-save.
 *
 * Periodically asks the backend to commit the workspace to `drafts/<username>`
 * so an author who closes a tab or drops their connection does not lose work.
 *
 * The backend writes that commit with git plumbing and never switches the
 * checked-out branch, so this can run while the author is typing without
 * disturbing anything. See `saveWorkspaceDraft` in gitWorkspaceService.
 *
 * The scheduling and formatting logic lives here, separate from React, so the
 * interval behaviour can be tested without mounting the editor.
 */

export type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'unchanged' | 'error';

export interface DraftSaveState {
  status: DraftSaveStatus;
  /** Epoch milliseconds of the last successful save, or null. */
  lastSavedAt: number | null;
  /** Short message when status is 'error'. */
  error: string | null;
}

export interface DraftSaveResponse {
  saved: boolean;
  branch: string;
  commitSha: string | null;
  reason?: 'unchanged' | 'empty-workspace';
  savedAt: string;
}

/** How often a draft is written, in milliseconds. */
export const DRAFT_SAVE_INTERVAL_MS = 10 * 60 * 1000;

export const initialDraftSaveState = (): DraftSaveState => ({
  status: 'idle',
  lastSavedAt: null,
  error: null,
});

/**
 * Formats the status-bar label.
 *
 * Deliberately reports "just now" for anything under a minute rather than
 * "0 min ago", and never claims a save happened when none has.
 */
export const formatDraftSavedLabel = (
  state: DraftSaveState,
  now: number = Date.now(),
): string => {
  if (state.status === 'saving') return 'Saving draft…';
  if (state.status === 'error') return 'Draft save failed';
  if (state.lastSavedAt === null) return 'No draft saved yet';

  const elapsedMs = Math.max(0, now - state.lastSavedAt);
  const minutes = Math.floor(elapsedMs / 60000);

  if (minutes < 1) return 'Draft saved just now';
  if (minutes === 1) return 'Draft saved 1 min ago';
  if (minutes < 60) return `Draft saved ${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'Draft saved 1 hr ago';
  return `Draft saved ${hours} hr ago`;
};

export interface RequestDraftSaveOptions {
  apiUrl: string;
  sessionId: string;
  signal?: AbortSignal;
}

/**
 * Asks the backend to write a draft commit.
 *
 * Uses `credentials: 'include'` because the API is cookie-authenticated and
 * served from a different origin in development.
 */
export const requestDraftSave = async ({
  apiUrl,
  sessionId,
  signal,
}: RequestDraftSaveOptions): Promise<DraftSaveResponse> => {
  const response = await fetch(
    `${apiUrl}/workspace/${encodeURIComponent(sessionId)}/git/draft`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal,
    },
  );

  const body = await response.text();
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      (parsed as { error?: string } | null)?.error ??
      `Draft save failed (HTTP ${response.status})`;
    throw new Error(message);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Draft save returned an unexpected response');
  }

  return parsed as DraftSaveResponse;
};

/**
 * Reduces a save outcome into the next status-bar state.
 *
 * An "unchanged" result still counts as a successful check, but must not move
 * `lastSavedAt` — claiming a fresh save when nothing was written would make
 * the indicator lie about how current the draft is.
 */
export const applyDraftSaveResult = (
  previous: DraftSaveState,
  result: DraftSaveResponse,
  now: number = Date.now(),
): DraftSaveState => {
  if (result.saved) {
    return { status: 'saved', lastSavedAt: now, error: null };
  }
  return {
    status: result.reason === 'unchanged' ? 'unchanged' : 'idle',
    lastSavedAt: previous.lastSavedAt,
    error: null,
  };
};

export const applyDraftSaveError = (
  previous: DraftSaveState,
  error: unknown,
): DraftSaveState => ({
  status: 'error',
  lastSavedAt: previous.lastSavedAt,
  error: error instanceof Error ? error.message : String(error),
});

/**
 * Decides whether a scheduled save should actually run.
 *
 * Skips when there is no workspace session, when a save is already in flight,
 * and when the author has no unsaved work — there is no point writing an
 * identical draft, and the backend would skip it anyway.
 */
export const shouldAttemptDraftSave = (options: {
  sessionId: string | null;
  status: DraftSaveStatus;
  unsavedCount: number;
}): boolean => {
  if (!options.sessionId) return false;
  if (options.status === 'saving') return false;
  return options.unsavedCount > 0;
};
