import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTeamSession } from './useTeamSession';
import { getTeamSession, setTeamSession } from '../utils/workspaceStorage';

const repo = { owner: 'demo', name: 'book', fullName: 'demo/book', defaultBranch: 'main' };
const created = { code: 'ABC123', repo, hostLogin: 'ada' };

const setup = (overrides: Partial<Parameters<typeof useTeamSession<typeof repo>>[0]> = {}) => {
  const request = vi.fn().mockResolvedValue(created);
  const onCreateError = vi.fn();
  const onCreated = vi.fn();
  const hook = renderHook(() =>
    useTeamSession({
      repo,
      user: { login: 'ada', name: 'Ada' },
      request: request as never,
      onCreateError,
      onCreated,
      ...overrides,
    }),
  );
  return { request, onCreateError, onCreated, ...hook };
};

describe('useTeamSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('starts in solo mode when nothing is stored', () => {
    const { result } = setup();
    expect(result.current.teamSession).toBeNull();
    expect(result.current.collaborationEnabled).toBe(false);
  });

  it('restores a stored team session and enables collaboration', () => {
    setTeamSession(created);
    const { result } = setup();
    expect(result.current.teamSession?.code).toBe('ABC123');
    expect(result.current.collaborationEnabled).toBe(true);
    expect(result.current.initialSession?.code).toBe('ABC123');
  });

  it('creates an invite code, persists it and reports success', async () => {
    const { result, request, onCreated } = setup();
    await act(() => result.current.createTeamSession());

    expect(request).toHaveBeenCalledWith(
      '/team-sessions/create',
      { method: 'POST', body: JSON.stringify({ repo, createdBy: { login: 'ada', name: 'Ada' } }) },
      'Failed to create team session',
    );
    expect(result.current.teamSession?.code).toBe('ABC123');
    expect(getTeamSession()?.code).toBe('ABC123');
    expect(result.current.collaborationEnabled).toBe(true);
    expect(result.current.collaborationStatus).toBe('Invite code ready');
    expect(result.current.teamSessionNotice).toBe('Team code ABC123 is ready');
    expect(result.current.teamSessionBusy).toBe(false);
    expect(onCreated).toHaveBeenCalled();
  });

  it('does nothing without a repo', async () => {
    const { result, request } = setup({ repo: null });
    await act(() => result.current.createTeamSession());
    expect(request).not.toHaveBeenCalled();
  });

  it('reports a creation failure and leaves collaboration off', async () => {
    const error = new Error('quota exceeded');
    const { result, onCreateError } = setup({ request: vi.fn().mockRejectedValue(error) as never });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(() => result.current.createTeamSession());
    consoleError.mockRestore();

    expect(onCreateError).toHaveBeenCalledWith(error);
    expect(result.current.collaborationEnabled).toBe(false);
    expect(result.current.collaborationStatus).toBe('quota exceeded');
    expect(result.current.teamSessionBusy).toBe(false);
  });

  it('ignores a second create while one is in flight', async () => {
    let release: (value: unknown) => void = () => undefined;
    const request = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const { result } = setup({ request: request as never });
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.createTeamSession(); });
    await act(() => result.current.createTeamSession());
    expect(request).toHaveBeenCalledTimes(1);
    release(created);
    await act(() => first);
  });

  it('switchToTeamMode reuses an existing code and creates one otherwise', async () => {
    const withCode = (() => { setTeamSession(created); return setup(); })();
    act(() => withCode.result.current.switchToTeamMode());
    expect(withCode.request).not.toHaveBeenCalled();
    expect(withCode.result.current.collaborationStatus).toBe('Team room ready');

    sessionStorage.clear();
    const fresh = setup();
    await act(async () => fresh.result.current.switchToTeamMode());
    expect(fresh.request).toHaveBeenCalledTimes(1);
  });

  it('switchToSoloMode clears the session, status and participants', async () => {
    setTeamSession(created);
    const { result } = setup();
    act(() => result.current.setCollaborators([{ clientId: 'c1', color: '#fff' }]));
    act(() => result.current.switchToSoloMode());

    expect(result.current.teamSession).toBeNull();
    expect(getTeamSession()).toBeNull();
    expect(result.current.collaborationEnabled).toBe(false);
    expect(result.current.collaborators).toEqual([]);
    expect(result.current.teamSessionNotice).toBe('Solo mode enabled');
  });

  it('clears the notice after a few seconds', async () => {
    const { result } = setup();
    await act(() => result.current.createTeamSession());
    expect(result.current.teamSessionNotice).not.toBe('');
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(result.current.teamSessionNotice).toBe('');
  });

  it('copies the invite code to the clipboard', async () => {
    setTeamSession(created);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { result } = setup();
    await act(() => result.current.copyTeamInviteCode());
    expect(writeText).toHaveBeenCalledWith('ABC123');
    expect(result.current.teamSessionNotice).toBe('Invite code copied');
  });

  it('falls back to a prompt when the clipboard is unavailable', async () => {
    setTeamSession(created);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    const { result } = setup();
    await act(() => result.current.copyTeamInviteCode());
    expect(prompt).toHaveBeenCalledWith('Copy this invite code', 'ABC123');
    prompt.mockRestore();
  });
});
