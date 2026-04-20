import type { MutableRefObject } from 'react';
import type { IPosition } from 'monaco-editor';
import {
  getPreviewBaseHref,
  prepareHtmlForSrcDoc,
} from './editorPreview';
import { isPreTeXtFile, pretexToHtml } from './pretexPreview';

export interface CollaborationParticipant {
  clientId: string;
  login?: string;
  name?: string;
  avatarUrl?: string;
  color: string;
  isSelf?: boolean;
  lastSeenAt?: number;
}

export interface TeamSessionData {
  code: string;
  repo: {
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
  };
  hostName?: string;
  hostLogin?: string;
  createdAt?: number;
}

interface CollaborationTabLike {
  id: string;
  path: string;
  name: string;
  content: string;
}

interface MonacoLikeEditor {
  getPosition?: () => IPosition | null;
  revealPositionInCenter?: (position: IPosition) => void;
  setPosition?: (position: IPosition) => void;
}

interface ApplyRemoteEditorUpdateArgs<TTab extends CollaborationTabLike> {
  activeTab: TTab | null;
  content: string;
  editor: MonacoLikeEditor | null;
  setCollaborationStatus: (value: string) => void;
  suppressEditorChangeRef: MutableRefObject<boolean>;
  tab: TTab;
  updateTabContent: (tabId: string, value: string) => void;
  updatedByName?: string;
}

interface EnqueueRebuildOptions {
  editToken: number;
  clearDraftOnSuccess: boolean;
  queuedStatus: string;
}

interface SyncCollaborativePreviewArgs<TTab extends CollaborationTabLike> {
  apiUrl: string;
  buildSessionId: string | null;
  compilationMode: 'repository' | 'file';
  ensureBuildSession: (options: { quiet: boolean; statusMessage: string }) => Promise<string | null>;
  enqueueRebuild: (filePath: string, value: string, options: EnqueueRebuildOptions) => void;
  liveEditMode: boolean;
  latestEditTokenRef: MutableRefObject<number>;
  previewUrl: string | null;
  setSrcDocContent: (value: string | null) => void;
  tab: TTab;
  triggerQuickUpdate: (filePath: string, value: string, statusMessage: string) => Promise<boolean>;
  value: string;
}

const COLLABORATION_PALETTE = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#fb7185'];

export const getOrCreateCollabClientId = () => {
  if (typeof window === 'undefined') {
    return `collab-${Date.now()}`;
  }

  const existing = window.localStorage.getItem('mra_collab_client_id');
  if (existing) return existing;

  const nextId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `collab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem('mra_collab_client_id', nextId);
  return nextId;
};

export const getParticipantName = (participant: CollaborationParticipant) =>
  participant.name || participant.login || 'Guest';

export const getParticipantInitials = (participant: CollaborationParticipant) => {
  const label = getParticipantName(participant).trim();
  if (!label) return 'G';
  const parts = label.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'G';
};

export const getCollaborationColor = (clientId: string) => {
  let hash = 0;
  for (let index = 0; index < clientId.length; index += 1) {
    hash = ((hash << 5) - hash) + clientId.charCodeAt(index);
    hash |= 0;
  }
  return COLLABORATION_PALETTE[Math.abs(hash) % COLLABORATION_PALETTE.length];
};

export const buildCollaborationRoomId = (teamCode: string | undefined, tabPath: string | undefined) => {
  if (!teamCode || !tabPath) return null;
  return `team:${teamCode}:${tabPath}`;
};

export const applyRemoteEditorUpdate = <TTab extends CollaborationTabLike>({
  activeTab,
  content,
  editor,
  setCollaborationStatus,
  suppressEditorChangeRef,
  tab,
  updateTabContent,
  updatedByName,
}: ApplyRemoteEditorUpdateArgs<TTab>) => {
  const latestTab = activeTab?.id === tab.id ? activeTab : tab;
  if (!latestTab || latestTab.content === content) return;

  const position = editor?.getPosition?.();
  suppressEditorChangeRef.current = true;
  updateTabContent(latestTab.id, content);

  window.setTimeout(() => {
    suppressEditorChangeRef.current = false;
    if (position && editor?.setPosition) {
      editor.setPosition(position);
      editor.revealPositionInCenter?.(position);
    }
  }, 0);

  if (updatedByName) {
    setCollaborationStatus(`${updatedByName} updated this file`);
  }
};

export const syncCollaborativePreview = async <TTab extends CollaborationTabLike>({
  apiUrl,
  buildSessionId,
  compilationMode,
  ensureBuildSession,
  enqueueRebuild,
  liveEditMode,
  latestEditTokenRef,
  previewUrl,
  setSrcDocContent,
  tab,
  triggerQuickUpdate,
  value,
}: SyncCollaborativePreviewArgs<TTab>) => {
  const remoteEditToken = Date.now();
  latestEditTokenRef.current = remoteEditToken;
  const lastDotIndex = tab.path.lastIndexOf('.');
  const currentExt = lastDotIndex >= 0 ? tab.path.slice(lastDotIndex).toLowerCase() : '';

  if (currentExt === '.html' || currentExt === '.htm') {
    setSrcDocContent(
      prepareHtmlForSrcDoc(value, getPreviewBaseHref(previewUrl, apiUrl), tab.path)
    );
    await triggerQuickUpdate(tab.path, value, 'Remote HTML synced');
    return;
  }

  if (compilationMode !== 'repository') return;

  if (liveEditMode) {
    await ensureBuildSession({ quiet: true, statusMessage: 'Preparing live preview…' });

    if (currentExt === '.css' || currentExt === '.js') {
      await triggerQuickUpdate(tab.path, value, 'Remote asset synced');
      return;
    }

    if (isPreTeXtFile(tab.name)) {
      setSrcDocContent(pretexToHtml(value));
      enqueueRebuild(tab.path, value, {
        editToken: remoteEditToken,
        clearDraftOnSuccess: true,
        queuedStatus: 'Compiling collaborator draft…',
      });
      return;
    }

    enqueueRebuild(tab.path, value, {
      editToken: remoteEditToken,
      clearDraftOnSuccess: false,
      queuedStatus: 'Compiling collaborator change…',
    });
    return;
  }

  if (buildSessionId) {
    enqueueRebuild(tab.path, value, {
      editToken: remoteEditToken,
      clearDraftOnSuccess: false,
      queuedStatus: 'Compiling collaborator change…',
    });
  }
};

export const readStoredTeamSession = (): TeamSessionData | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem('teamSession');
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.code || !parsed?.repo?.fullName) return null;

    // Return only the fields we need — no auth tokens are stored here,
    // but limiting the surface reduces what an XSS attack could harvest.
    return {
      code: parsed.code,
      repo: {
        owner: parsed.repo.owner,
        name: parsed.repo.name,
        fullName: parsed.repo.fullName,
        defaultBranch: parsed.repo.defaultBranch,
      },
      hostName: parsed.hostName,
      hostLogin: parsed.hostLogin,
      createdAt: parsed.createdAt,
    };
  } catch (error) {
    console.error('Failed to parse stored team session:', error);
    return null;
  }
};
