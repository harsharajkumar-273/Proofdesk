import type { MutableRefObject } from 'react';
import type { IPosition } from 'monaco-editor';
import {
  getPreviewBaseHref,
  prepareHtmlForSrcDoc,
} from './editorPreview';
import { getTeamSession } from './workspaceStorage';

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
  sectionXmlId?: string | null;
}

interface SyncCollaborativePreviewArgs<TTab extends CollaborationTabLike> {
  apiUrl: string;
  buildSessionId: string | null;
  compilationMode: 'repository' | 'file';
  enqueueRebuild: (filePath: string, value: string, options: EnqueueRebuildOptions) => void;
  latestEditTokenRef: MutableRefObject<number>;
  previewUrl: string | null;
  setSrcDocContent: (value: string | null) => void;
  tab: TTab;
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
  enqueueRebuild,
  latestEditTokenRef,
  previewUrl,
  setSrcDocContent,
  tab,
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
    return;
  }

  if (compilationMode !== 'repository') return;

  if (buildSessionId) {
    enqueueRebuild(tab.path, value, {
      editToken: remoteEditToken,
      clearDraftOnSuccess: false,
    });
  }
};

export const readStoredTeamSession = (): TeamSessionData | null => {
  return getTeamSession() as TeamSessionData | null;
};
