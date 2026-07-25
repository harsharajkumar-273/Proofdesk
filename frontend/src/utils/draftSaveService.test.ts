import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDraftSavedLabel,
  requestDraftSave,
  applyDraftSaveResult,
  applyDraftSaveError,
  shouldAttemptDraftSave,
  initialDraftSaveState,
  DRAFT_SAVE_INTERVAL_MS,
  type DraftSaveState,
} from './draftSaveService';

const stateAt = (lastSavedAt: number | null, status: DraftSaveState['status'] = 'saved'): DraftSaveState => ({
  status,
  lastSavedAt,
  error: null,
});

describe('DRAFT_SAVE_INTERVAL_MS', () => {
  it('is the ten minutes the issue asks for', () => {
    expect(DRAFT_SAVE_INTERVAL_MS).toBe(600000);
  });
});

describe('formatDraftSavedLabel', () => {
  const now = 1_000_000_000_000;

  it('reports when nothing has been saved yet', () => {
    expect(formatDraftSavedLabel(initialDraftSaveState(), now)).toBe('No draft saved yet');
  });

  it('reports an in-flight save', () => {
    expect(formatDraftSavedLabel(stateAt(now, 'saving'), now)).toBe('Saving draft…');
  });

  it('reports a failure', () => {
    expect(formatDraftSavedLabel(stateAt(now, 'error'), now)).toBe('Draft save failed');
  });

  it('says "just now" under a minute rather than "0 min ago"', () => {
    expect(formatDraftSavedLabel(stateAt(now - 30_000), now)).toBe('Draft saved just now');
  });

  it('uses the singular at exactly one minute', () => {
    expect(formatDraftSavedLabel(stateAt(now - 60_000), now)).toBe('Draft saved 1 min ago');
  });

  it('counts whole minutes', () => {
    expect(formatDraftSavedLabel(stateAt(now - 12 * 60_000), now)).toBe('Draft saved 12 min ago');
  });

  it('switches to hours past sixty minutes', () => {
    expect(formatDraftSavedLabel(stateAt(now - 60 * 60_000), now)).toBe('Draft saved 1 hr ago');
    expect(formatDraftSavedLabel(stateAt(now - 3 * 60 * 60_000), now)).toBe('Draft saved 3 hr ago');
  });

  it('never reports a negative age if the clock shifts', () => {
    expect(formatDraftSavedLabel(stateAt(now + 5000), now)).toBe('Draft saved just now');
  });
});

describe('applyDraftSaveResult', () => {
  const now = 5_000;

  it('records the time when a draft was written', () => {
    const next = applyDraftSaveResult(initialDraftSaveState(), {
      saved: true,
      branch: 'drafts/x',
      commitSha: 'abc',
      savedAt: '',
    }, now);
    expect(next).toEqual({ status: 'saved', lastSavedAt: now, error: null });
  });

  it('does not move the timestamp when nothing changed', () => {
    const previous = stateAt(1234);
    const next = applyDraftSaveResult(previous, {
      saved: false,
      branch: 'drafts/x',
      commitSha: 'abc',
      reason: 'unchanged',
      savedAt: '',
    }, now);
    expect(next.lastSavedAt).toBe(1234);
    expect(next.status).toBe('unchanged');
  });

  it('stays idle for an empty workspace', () => {
    const next = applyDraftSaveResult(initialDraftSaveState(), {
      saved: false,
      branch: 'drafts/x',
      commitSha: null,
      reason: 'empty-workspace',
      savedAt: '',
    }, now);
    expect(next.status).toBe('idle');
    expect(next.lastSavedAt).toBeNull();
  });

  it('clears a previous error on success', () => {
    const previous: DraftSaveState = { status: 'error', lastSavedAt: null, error: 'boom' };
    const next = applyDraftSaveResult(previous, {
      saved: true, branch: 'b', commitSha: 'c', savedAt: '',
    }, now);
    expect(next.error).toBeNull();
  });
});

describe('applyDraftSaveError', () => {
  it('records the message and preserves the last successful save', () => {
    const next = applyDraftSaveError(stateAt(999), new Error('network down'));
    expect(next.status).toBe('error');
    expect(next.error).toBe('network down');
    expect(next.lastSavedAt).toBe(999);
  });

  it('handles a non-Error rejection', () => {
    expect(applyDraftSaveError(initialDraftSaveState(), 'plain string').error).toBe('plain string');
  });
});

describe('shouldAttemptDraftSave', () => {
  it('runs when there is unsaved work and a session', () => {
    expect(shouldAttemptDraftSave({ sessionId: 's', status: 'idle', unsavedCount: 2 })).toBe(true);
  });

  it('skips without a workspace session', () => {
    expect(shouldAttemptDraftSave({ sessionId: null, status: 'idle', unsavedCount: 2 })).toBe(false);
  });

  it('skips while a save is already in flight', () => {
    expect(shouldAttemptDraftSave({ sessionId: 's', status: 'saving', unsavedCount: 2 })).toBe(false);
  });

  it('skips when there is nothing unsaved', () => {
    expect(shouldAttemptDraftSave({ sessionId: 's', status: 'idle', unsavedCount: 0 })).toBe(false);
  });

  it('runs again after a previous error', () => {
    expect(shouldAttemptDraftSave({ sessionId: 's', status: 'error', unsavedCount: 1 })).toBe(true);
  });
});

describe('requestDraftSave', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  it('posts to the draft endpoint for the session', async () => {
    fetchMock.mockResolvedValueOnce(ok({ saved: true, branch: 'drafts/x', commitSha: 'a', savedAt: '' }));
    await requestDraftSave({ apiUrl: 'http://api', sessionId: 'sess-1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://api/workspace/sess-1/git/draft');
    expect(init).toMatchObject({ method: 'POST' });
  });

  it('sends credentials so the session cookie reaches the backend', async () => {
    fetchMock.mockResolvedValueOnce(ok({ saved: true, branch: 'b', commitSha: 'a', savedAt: '' }));
    await requestDraftSave({ apiUrl: 'http://api', sessionId: 's' });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('encodes a session id containing url-unsafe characters', async () => {
    fetchMock.mockResolvedValueOnce(ok({ saved: true, branch: 'b', commitSha: 'a', savedAt: '' }));
    await requestDraftSave({ apiUrl: 'http://api', sessionId: 'a/b c' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('a%2Fb%20c');
  });

  it('returns the parsed result', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ saved: true, branch: 'drafts/me', commitSha: 'deadbeef', savedAt: '2026-01-01' }),
    );
    const result = await requestDraftSave({ apiUrl: 'http://api', sessionId: 's' });
    expect(result.saved).toBe(true);
    expect(result.branch).toBe('drafts/me');
  });

  it('surfaces the backend error message', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Access denied' }), { status: 403 }),
    );
    await expect(requestDraftSave({ apiUrl: 'http://api', sessionId: 's' })).rejects.toThrow(
      'Access denied',
    );
  });

  it('falls back to the status code when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>gateway</html>', { status: 502 }));
    await expect(requestDraftSave({ apiUrl: 'http://api', sessionId: 's' })).rejects.toThrow('502');
  });

  it('rejects when a 200 response is not an object', async () => {
    fetchMock.mockResolvedValueOnce(new Response('null', { status: 200 }));
    await expect(requestDraftSave({ apiUrl: 'http://api', sessionId: 's' })).rejects.toThrow(
      /unexpected response/i,
    );
  });
});
