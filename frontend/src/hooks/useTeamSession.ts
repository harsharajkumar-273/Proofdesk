import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readStoredTeamSession,
  type CollaborationParticipant,
  type TeamSessionData,
} from '../utils/editorCollaboration';
import { setTeamSession as saveTeamSessionToStorage } from '../utils/workspaceStorage';

const NOTICE_DURATION_MS = 2500;

interface UseTeamSessionOptions<TRepo> {
  repo: TRepo | null;
  user: { login?: string; name?: string } | null;
  request: <T>(pathname: string, init?: RequestInit, fallbackMessage?: string) => Promise<T>;
  /** Called when creating an invite code fails, so the page can show its error banner. */
  onCreateError: (error: unknown) => void;
  /** Called after an invite code was created, so the page can clear stale workspace notices. */
  onCreated: () => void;
}

/**
 * Owns solo/team mode: the invite-code session, its persisted copy in
 * localStorage, collaboration status text and the connected participants.
 */
export function useTeamSession<TRepo>({ repo, user, request, onCreateError, onCreated }: UseTeamSessionOptions<TRepo>) {
  // Read once so the page can compare a stored session against the repo it is opening.
  const [initialSession] = useState<TeamSessionData | null>(() => readStoredTeamSession());
  const [teamSession, setTeamSession] = useState<TeamSessionData | null>(initialSession);
  const [collaborationEnabled, setCollaborationEnabled] = useState<boolean>(Boolean(initialSession));
  const [collaborationStatus, setCollaborationStatus] = useState<string>('');
  const [collaborators, setCollaborators] = useState<CollaborationParticipant[]>([]);
  const [teamSessionBusy, setTeamSessionBusy] = useState<boolean>(false);
  const [teamSessionNotice, setTeamSessionNotice] = useState<string>('');

  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const latest = useRef({ repo, user, request, onCreateError, onCreated, teamSession });
  latest.current = { repo, user, request, onCreateError, onCreated, teamSession };

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  const persistTeamSession = useCallback((nextSession: TeamSessionData | null) => {
    setTeamSession(nextSession);
    if (typeof window === 'undefined') return;
    saveTeamSessionToStorage(nextSession);
  }, []);

  const showTeamNotice = useCallback((message: string) => {
    setTeamSessionNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setTeamSessionNotice((current) => (current === message ? '' : current));
    }, NOTICE_DURATION_MS);
  }, []);

  const copyTeamInviteCode = useCallback(async () => {
    const code = latest.current.teamSession?.code;
    if (!code) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        showTeamNotice('Invite code copied');
        return;
      }
    } catch (error) {
      console.error('Failed to copy invite code:', error);
    }

    window.prompt('Copy this invite code', code);
  }, [showTeamNotice]);

  const createTeamSession = useCallback(async () => {
    const { repo: currentRepo, user: currentUser, request: send } = latest.current;
    if (!currentRepo || busyRef.current) return;

    busyRef.current = true;
    setTeamSessionBusy(true);
    setCollaborationStatus('Generating invite code…');

    try {
      const data = await send<TeamSessionData>(
        '/team-sessions/create',
        {
          method: 'POST',
          body: JSON.stringify({
            repo: currentRepo,
            createdBy: { login: currentUser?.login, name: currentUser?.name },
          }),
        },
        'Failed to create team session',
      );

      persistTeamSession(data);
      setCollaborationEnabled(true);
      setCollaborationStatus('Invite code ready');
      showTeamNotice(`Team code ${data.code} is ready`);
      latest.current.onCreated();
    } catch (error) {
      console.error('Create team session error:', error);
      setCollaborationEnabled(false);
      latest.current.onCreateError(error);
      setCollaborationStatus(error instanceof Error ? error.message : 'Failed to create invite code');
    } finally {
      busyRef.current = false;
      setTeamSessionBusy(false);
    }
  }, [persistTeamSession, showTeamNotice]);

  const switchToSoloMode = useCallback(() => {
    persistTeamSession(null);
    setCollaborationEnabled(false);
    setCollaborationStatus('');
    setCollaborators([]);
    showTeamNotice('Solo mode enabled');
  }, [persistTeamSession, showTeamNotice]);

  const switchToTeamMode = useCallback(() => {
    setCollaborationEnabled(true);
    if (latest.current.teamSession?.code) {
      setCollaborationStatus('Team room ready');
      return;
    }

    void createTeamSession();
  }, [createTeamSession]);

  return {
    initialSession,
    teamSession,
    collaborationEnabled,
    setCollaborationEnabled,
    collaborationStatus,
    setCollaborationStatus,
    collaborators,
    setCollaborators,
    teamSessionBusy,
    teamSessionNotice,
    persistTeamSession,
    showTeamNotice,
    copyTeamInviteCode,
    createTeamSession,
    switchToSoloMode,
    switchToTeamMode,
  };
}
