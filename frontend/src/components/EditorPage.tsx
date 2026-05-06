import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loader } from '@monaco-editor/react';
import * as monacoRuntime from 'monaco-editor/esm/vs/editor/editor.api';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import type { editor } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import {
  GitBranch, Search, FolderTree,
  Terminal as TerminalIcon,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { applyHandshakeTheme } from '../themes/handshakeTheme';
import '../themes/handshakeeditor.css';
import SaveReviewDialog from './SaveReviewDialog';
import OnboardingTour from './OnboardingTour';
import EditorTopBar, { type RepositorySearchResult } from './editor/EditorTopBar';
import PreviewPane from './editor/PreviewPane';
import EditorStatusBar from './editor/EditorStatusBar';
import EditorTabBar from './editor/EditorTabBar';
import WorkspaceNoticeBanner from './editor/WorkspaceNoticeBanner';
import EditorExplorerPane from './editor/EditorExplorerPane';
import EditorSearchPane from './editor/EditorSearchPane';
import EditorProblemsPane, { type Diagnostic } from './editor/EditorProblemsPane';
import BuildLogPanel from './editor/BuildLogPanel';
import EditorRepoTabBar, { type RepoTabEntry } from './editor/EditorRepoTabBar';
import {
  buildPreviewHref,
  getLanguageFromFilename,
  getPreviewBaseHref,
  prepareHtmlForSrcDoc,
} from '../utils/editorPreview';
import {
  EditorApiError,
  formatEditorError,
  isAuthExpiredError,
  requestJson,
} from '../utils/editorApi';
import {
  applyRemoteEditorUpdate,
  buildCollaborationRoomId,
  getCollaborationColor,
  getOrCreateCollabClientId,
  getParticipantInitials,
  getParticipantName,
  readStoredTeamSession,
  syncCollaborativePreview,
  type CollaborationParticipant,
  type TeamSessionData,
} from '../utils/editorCollaboration';
import {
  getReviewMarkerLabel,
  pushRecentFile,
  readRecentFiles,
  readReviewMarkers,
  removeReviewMarker,
  resolvePreviewTarget,
  upsertReviewMarker,
  type RecentFileEntry,
  type ReviewCommentEntry,
  type ReviewMarkerEntry,
  type ReviewMarkerStatus,
  type ReviewThreadEntry,
} from '../utils/editorWorkspace';
import { summarizeUnsavedTabs, type TabChangeSummary } from '../utils/editorDiff';
import { isPreTeXtFile } from '../utils/pretexPreview';
import { isMathValidatableFile, validateMathInBuffer } from '../utils/mathValidator';
import { isPtxFile, validatePtxBuffer } from '../utils/pretexValidator';
import { parseBuildErrors } from '../utils/buildErrorParser';
import { type PreviewSnapshotEntry } from '../utils/previewDiff';
import { MonacoYjsCollaborationSession } from '../utils/yjsCollaboration';

const monacoGlobal = self as Window & typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (workerId: string, label: string) => Worker;
  };
};

monacoGlobal.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') {
      return new JsonWorker();
    }

    if (label === 'css' || label === 'scss' || label === 'less') {
      return new CssWorker();
    }

    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new HtmlWorker();
    }

    if (label === 'typescript' || label === 'javascript') {
      return new TypeScriptWorker();
    }

    return new EditorWorker();
  },
};

loader.config({ monaco: monacoRuntime });

const MonacoEditor = lazy(() => import('@monaco-editor/react'));
const TerminalPanel = lazy(() => import('./Terminal'));
const GitPanel = lazy(() => import('./GitPanel'));

interface Repository {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha?: string;
  size?: number;
  download_url?: string;
}

interface CompilationResult {
  success: boolean;
  output: string;
  projectType?: string;
  fileCount?: number;
  mainFile?: string;
}

interface BuildArtifact {
  path: string;
  type: string;
  fullPath?: string;
}

interface BuildResponse {
  success: boolean;
  sessionId?: string;
  buildType?: string;
  stdout?: string;
  stderr?: string;
  command?: string;
  entryFile?: string | null;
  artifacts?: BuildArtifact[];
  fromCache?: boolean;
  error?: string;
  code?: string;
  advice?: string;
  details?: string;
}

interface WorkspaceInitResponse {
  sessionId: string;
  tree?: FileNode[];
  repoFullName?: string;
  fromCache?: boolean;
}

interface QueuedRebuild {
  filePath: string;
  value: string;
  editToken: number;
  clearDraftOnSuccess: boolean;
  queuedStatus: string;
  sectionXmlId: string | null;
}

interface UserData {
  login: string;
  name?: string;
  avatar_url?: string;
  email?: string;
}

interface Tab {
  id: string;
  path: string;
  name: string;
  content: string;
  originalContent: string;
  sha: string;
  hasUnsavedChanges: boolean;
  language?: string;
}

interface EditorPageProps {
  onLogout: () => void;
}

interface WorkspaceNotice {
  tone: 'error' | 'success' | 'info';
  title: string;
  advice?: string;
  details?: string;
  actionLabel?: string;
  actionType?: 'signin' | 'retry-build' | 'open-preview';
}

interface WorkspaceSnapshot {
  repo: Repository;
  sessionId: string | null;
  tabs: Tab[];
  activeTabId: string | null;
  fileTree: FileNode[];
  folderContents: Record<string, FileNode[]>;
  buildResult: BuildResponse | null;
  buildErrors: Diagnostic[];
  previewUrl: string | null;
  previewEntryFile: string | null;
  expandedFolders: Set<string>;
  compilationMode: 'repository' | 'file';
  liveEditMode: boolean;
  recentFiles: RecentFileEntry[];
  previewHistory: PreviewSnapshotEntry[];
  previewBaseSnapshotId: string | null;
  previewDiffEnabled: boolean;
}

type EditorTimer = ReturnType<typeof window.setTimeout> | null;

type EditorTestWindow = Window & {
  __MRA_TEST__?: boolean;
  __mraSetActiveEditorValue?: (value: string) => void;
  __mraIsActiveEditorReady?: boolean;
  __mraCollaborationSnapshot?: {
    count: number;
    status: string;
    enabled?: boolean;
    teamCode?: string | null;
    repoFullName?: string | null;
    activePath?: string | null;
    userLogin?: string | null;
    editorReady?: boolean;
    hasEditor?: boolean;
    roomId?: string | null;
    sessionActive?: boolean;
  };
  __mraWorkspaceSnapshot?: {
    loading: boolean;
    repoFullName: string | null;
    filePaths: string[];
  };
};

const isCompactEditorViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < 768;

const EditorPage: React.FC<EditorPageProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  const initialStoredTeamSessionRef = useRef<TeamSessionData | null>(readStoredTeamSession());
  
  const [repo, setRepo] = useState<Repository | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [folderContents, setFolderContents] = useState<Record<string, FileNode[]>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<boolean>(false);
  const [compiling, setCompiling] = useState<boolean>(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [compiledOutput, setCompiledOutput] = useState<string>('');
  const [repoCompilationResult, setRepoCompilationResult] = useState<CompilationResult | null>(null);
  
  const [buildSessionId, setBuildSessionId] = useState<string | null>(null);
  const [buildResult, setBuildResult] = useState<BuildResponse | null>(null);
  const [streamingBuildSessionId, setStreamingBuildSessionId] = useState<string | null>(null);
  const [buildErrors, setBuildErrors] = useState<Diagnostic[]>([]);
  const [pdfBuilding, setPdfBuilding] = useState<boolean>(false);
  const pdfPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewEntryFile, setPreviewEntryFile] = useState<string | null>(null);
  const [previewFrameKey, setPreviewFrameKey] = useState<number>(0);

  // Live editing state
  const [liveEditMode, setLiveEditMode] = useState<boolean>(false);
  const [liveEditStatus, setLiveEditStatus] = useState<string>('');
  const [isRebuilding, setIsRebuilding] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [collaborationEnabled, setCollaborationEnabled] = useState<boolean>(Boolean(initialStoredTeamSessionRef.current));
  const [collaborationStatus, setCollaborationStatus] = useState<string>('');
  const [collaborators, setCollaborators] = useState<CollaborationParticipant[]>([]);
  const [editorReady, setEditorReady] = useState<boolean>(false);
  const [collaborationRetryKey, setCollaborationRetryKey] = useState<number>(0);
  const [teamSession, setTeamSession] = useState<TeamSessionData | null>(initialStoredTeamSessionRef.current);
  const [teamSessionBusy, setTeamSessionBusy] = useState<boolean>(false);
  const [teamSessionNotice, setTeamSessionNotice] = useState<string>('');
  const [workspaceNotice, setWorkspaceNotice] = useState<WorkspaceNotice | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [reviewMarkers, setReviewMarkers] = useState<Record<string, ReviewMarkerEntry>>({});
  const [reviewStatus, setReviewStatus] = useState<ReviewMarkerStatus>('needs-review');
  const [reviewNote, setReviewNote] = useState<string>('');
  const [reviewCommentDraft, setReviewCommentDraft] = useState<string>('');
  const [selectedReviewLine, setSelectedReviewLine] = useState<number | null>(1);
  const [saveReviewOpen, setSaveReviewOpen] = useState<boolean>(false);
  const [pendingSaveChanges, setPendingSaveChanges] = useState<TabChangeSummary[]>([]);
  const [previewHistory, setPreviewHistory] = useState<PreviewSnapshotEntry[]>([]);
  const [previewDiffEnabled, setPreviewDiffEnabled] = useState<boolean>(false);
  const [previewBaseSnapshotId, setPreviewBaseSnapshotId] = useState<string | null>(null);

  // GoLive: instant HTML preview via srcDoc
  const [srcDocContent, setSrcDocContent] = useState<string | null>(null);
  const livePreviewTimerRef = useRef<EditorTimer>(null);
  const buildInitPromiseRef = useRef<Promise<string | null> | null>(null);
  const latestEditTokenRef = useRef<number>(0);
  const rebuildInFlightRef = useRef<boolean>(false);
  const queuedRebuildRef = useRef<QueuedRebuild | null>(null);
  const workspaceInitPromiseRef = useRef<Promise<WorkspaceInitResponse | null> | null>(null);
  const collabClientIdRef = useRef<string>(getOrCreateCollabClientId());
  const collabRoomIdRef = useRef<string | null>(null);
  const suppressEditorChangeRef = useRef<boolean>(false);
  const collabSessionRef = useRef<MonacoYjsCollaborationSession | null>(null);
  const activeTabRef = useRef<Tab | null>(null);
  const liveEditModeRef = useRef<boolean>(liveEditMode);
  const handleEditorChangeRef = useRef<(value: string | undefined) => void>(() => {});
  const compilationModeRef = useRef<'repository' | 'file'>('repository');
  const buildSessionIdRef = useRef<string | null>(buildSessionId);
  const previewUrlRef = useRef<string | null>(previewUrl);
  const previewEntryFileRef = useRef<string | null>(previewEntryFile);

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const activeTabIdRef = useRef<string | null>(activeTabId);
  const activeSectionXmlIdRef = useRef<string | null>(null);
  
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() => isCompactEditorViewport());
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => !isCompactEditorViewport());
  const wasCompactViewportRef = useRef<boolean>(isCompactViewport);
  const [activityBarTab, setActivityBarTab] = useState<'explorer' | 'search' | 'git' | 'problems' | 'debug' | 'extensions'>('explorer');
  const [profileDropdownOpen, setProfileDropdownOpen] = useState<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [userRepos, setUserRepos] = useState<RepositorySearchResult[]>([]);
  const [showRepoSwitcher, setShowRepoSwitcher] = useState<boolean>(false);
  
  const [terminalOpen, setTerminalOpen] = useState<boolean>(false);
  const [terminalMaximized, setTerminalMaximized] = useState<boolean>(false);
  
  const [sidebarWidth, setSidebarWidth] = useState<number>(280);
  const [editorWidth, setEditorWidth] = useState<number>(60);
  const [bottomPanelHeight, setBottomPanelHeight] = useState<number>(300);
  
  const [compilationMode, setCompilationMode] = useState<'repository' | 'file'>('repository');
  const [autoCompile, setAutoCompile] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const setCompilationModeState = (nextMode: 'repository' | 'file') => {
    compilationModeRef.current = nextMode;
    setCompilationMode(nextMode);
  };

  const setLiveEditModeState: React.Dispatch<React.SetStateAction<boolean>> = (nextValue) => {
    setLiveEditMode((currentValue) => {
      const resolvedValue = typeof nextValue === 'function'
        ? (nextValue as (value: boolean) => boolean)(currentValue)
        : nextValue;
      liveEditModeRef.current = resolvedValue;
      return resolvedValue;
    });
  };

  // ── Multi-repo workspace management ──────────────────────────────────────────
  const [openRepoKeys, setOpenRepoKeys] = useState<string[]>([]);
  const [activeRepoKey, setActiveRepoKey] = useState<string | null>(null);
  const workspaceSnapshots = useRef<Map<string, WorkspaceSnapshot>>(new Map());

  const activeTab = tabs.find(t => t.id === activeTabId);
  const unsavedTabs = useMemo(() => tabs.filter((tab) => tab.hasUnsavedChanges), [tabs]);
  const reviewEntries = useMemo(
    () => Object.values(reviewMarkers).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [reviewMarkers]
  );
  const activeReviewThreads = useMemo<ReviewThreadEntry[]>(
    () => (activeTab ? [...(reviewMarkers[activeTab.path]?.threads || [])].sort((left, right) => left.lineNumber - right.lineNumber) : []),
    [activeTab, reviewMarkers]
  );
  const reviewSummary = useMemo(() => {
    let approvedFiles = 0;
    let requestedFiles = 0;
    let verifyPreviewFiles = 0;
    let openThreads = 0;

    for (const entry of Object.values(reviewMarkers)) {
      if (entry.status === 'approved' || entry.status === 'ready') approvedFiles += 1;
      if (entry.status === 'changes-requested') requestedFiles += 1;
      if (entry.status === 'verify-preview') verifyPreviewFiles += 1;
      openThreads += (entry.threads || []).filter((thread) => thread.status === 'open').length;
    }

    return {
      filesTracked: Object.keys(reviewMarkers).length,
      approvedFiles,
      requestedFiles,
      verifyPreviewFiles,
      openThreads,
    };
  }, [reviewMarkers]);

  const allDiagnostics = useMemo<Diagnostic[]>(() => {
    const result: Diagnostic[] = [];
    for (const tab of tabs) {
      if (isMathValidatableFile(tab.path)) {
        for (const issue of validateMathInBuffer(tab.content, tab.path)) {
          result.push({ filePath: tab.path, fileName: tab.name, ...issue });
        }
      }
      if (isPtxFile(tab.path)) {
        for (const issue of validatePtxBuffer(tab.content, tab.path)) {
          result.push({ filePath: tab.path, fileName: tab.name, ...issue });
        }
      }
    }
    // Build errors: match parsed errors against open tabs
    for (const err of buildErrors) {
      const tab = tabs.find(
        (t) => t.path === err.filePath || err.filePath.endsWith(t.name),
      );
      if (tab) result.push({ ...err, filePath: tab.path, fileName: tab.name });
    }
    return result;
  }, [tabs, buildErrors]);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const reviewDecorationIdsRef = useRef<string[]>([]);
  const mathValidationTimerRef = useRef<number | null>(null);
  const ptxValidationTimerRef = useRef<number | null>(null);
  const rebuildTimer = useRef<EditorTimer>(null);
  
  const sidebarResizeRef = useRef<{ isResizing: boolean; startX: number; startWidth: number }>({
    isResizing: false,
    startX: 0,
    startWidth: 280
  });
  
  const editorResizeRef = useRef<{ isResizing: boolean; startX: number; startWidth: number }>({
    isResizing: false,
    startX: 0,
    startWidth: 60
  });
  
  const terminalResizeRef = useRef<{ isResizing: boolean; startY: number; startHeight: number }>({
    isResizing: false,
    startY: 0,
    startHeight: 300
  });

  const persistTeamSession = (nextSession: TeamSessionData | null) => {
    setTeamSession(nextSession);
    if (typeof window === 'undefined') return;

    if (nextSession) {
      window.sessionStorage.setItem('teamSession', JSON.stringify(nextSession));
      return;
    }

    window.sessionStorage.removeItem('teamSession');
  };

  const saveCurrentSnapshot = () => {
    if (!repo) return;
    workspaceSnapshots.current.set(repo.fullName, {
      repo,
      sessionId: buildSessionIdRef.current,
      tabs,
      activeTabId,
      fileTree,
      folderContents,
      buildResult,
      buildErrors,
      previewUrl: previewUrlRef.current,
      previewEntryFile: previewEntryFileRef.current,
      expandedFolders,
      compilationMode,
      liveEditMode,
      recentFiles,
      previewHistory,
      previewBaseSnapshotId,
      previewDiffEnabled,
    });
  };

  const restoreFromSnapshot = (snapshot: WorkspaceSnapshot) => {
    setRepo(snapshot.repo);
    buildSessionIdRef.current = snapshot.sessionId;
    setBuildSessionId(snapshot.sessionId);
    activeTabIdRef.current = snapshot.activeTabId;
    activeTabRef.current = snapshot.tabs.find((t) => t.id === snapshot.activeTabId) ?? null;
    setTabs(snapshot.tabs);
    setActiveTabId(snapshot.activeTabId);
    setFileTree(snapshot.fileTree);
    setFolderContents(snapshot.folderContents);
    setBuildResult(snapshot.buildResult);
    setBuildErrors(snapshot.buildErrors);
    previewUrlRef.current = snapshot.previewUrl;
    setPreviewUrl(snapshot.previewUrl);
    previewEntryFileRef.current = snapshot.previewEntryFile;
    setPreviewEntryFile(snapshot.previewEntryFile);
    setExpandedFolders(snapshot.expandedFolders);
    setCompilationModeState(snapshot.compilationMode);
    setLiveEditModeState(snapshot.liveEditMode);
    setRecentFiles(snapshot.recentFiles);
    setPreviewHistory(snapshot.previewHistory);
    setPreviewBaseSnapshotId(snapshot.previewBaseSnapshotId);
    setPreviewDiffEnabled(snapshot.previewDiffEnabled);
    setSrcDocContent(null);
    setWorkspaceNotice(null);
    workspaceInitPromiseRef.current = null;
    buildInitPromiseRef.current = null;
    rebuildInFlightRef.current = false;
    queuedRebuildRef.current = null;
    setStreamingBuildSessionId(null);
    setLoading(false);
    setCompiling(false);
    setSaving(false);
  };

  const closeRepo = (repoKey: string) => {
    const newKeys = openRepoKeys.filter((k) => k !== repoKey);

    const sessionToClean =
      repoKey === activeRepoKey
        ? buildSessionIdRef.current
        : workspaceSnapshots.current.get(repoKey)?.sessionId ?? null;

    if (sessionToClean) {
      fetch(`${API_URL}/build/cleanup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionToClean }),
      }).catch(() => {});
    }

    workspaceSnapshots.current.delete(repoKey);

    if (repoKey === activeRepoKey) {
      const nextKey = newKeys[newKeys.length - 1] ?? null;
      if (nextKey) {
        const snap = workspaceSnapshots.current.get(nextKey);
        if (snap) {
          restoreFromSnapshot(snap);
          setActiveRepoKey(nextKey);
          sessionStorage.setItem('selectedRepo', JSON.stringify(snap.repo));
        }
      } else {
        navigate('/repo-input');
      }
    }

    setOpenRepoKeys(newKeys);
  };

  const showTeamNotice = (message: string) => {
    setTeamSessionNotice(message);
    window.setTimeout(() => {
      setTeamSessionNotice((current) => current === message ? '' : current);
    }, 2500);
  };

  const jsonHeaders = (headers: HeadersInit = {}, includeJson = false): HeadersInit => ({
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  });

  const apiRequest = async <T,>(pathname: string, init: RequestInit = {}, fallbackMessage = 'Request failed') =>
    requestJson<T>(`${API_URL}${pathname}`, {
      ...init,
      credentials: 'include',
      headers: jsonHeaders(init.headers, typeof init.body === 'string'),
    }, fallbackMessage);

  const loadPreviewHistory = async (sessionId: string, preserveSelection = false) => {
    try {
      const data = await apiRequest<{ snapshots: PreviewSnapshotEntry[] }>(
        `/build/preview-history/${sessionId}`,
        {},
        'Failed to load preview history'
      );
      const snapshots = Array.isArray(data.snapshots) ? data.snapshots : [];
      setPreviewHistory(snapshots);
      setPreviewBaseSnapshotId((current) => {
        if (preserveSelection && current && snapshots.some((snapshot) => snapshot.snapshotId === current)) {
          return current;
        }
        return snapshots[1]?.snapshotId || null;
      });
      return snapshots;
    } catch {
      setPreviewHistory([]);
      setPreviewBaseSnapshotId(null);
      return [];
    }
  };

  const [loadingMessage, setLoadingMessage] = useState<string>('Initializing workspace...');

  const initializeWorkspaceSession = async (
    repoData: Repository | null = repo,
    options: { hydrateTree?: boolean } = {}
  ): Promise<WorkspaceInitResponse | null> => {
    if (!repoData) return null;

    if (buildSessionIdRef.current) {
      console.log('Reusing existing session:', buildSessionIdRef.current);
      return {
        sessionId: buildSessionIdRef.current,
        tree: options.hydrateTree ? fileTree : undefined,
      };
    }

    if (workspaceInitPromiseRef.current) {
      return workspaceInitPromiseRef.current;
    }

    setLoadingMessage('Contacting server...');
    const initPromise = apiRequest<WorkspaceInitResponse>('/workspace/init', {
      method: 'POST',
      body: JSON.stringify({
        owner: repoData.owner,
        repo: repoData.name,
        defaultBranch: repoData.defaultBranch,
        preferSeed: true,
      }),
    }, 'Failed to prepare repository workspace')
      .then((data) => {
        buildSessionIdRef.current = data.sessionId;
        setBuildSessionId(data.sessionId);

        if (options.hydrateTree && Array.isArray(data.tree)) {
          setFileTree(data.tree);
          setWorkspaceNotice(null);
        }

        return data;
      })
      .catch((error: unknown) => {
        workspaceInitPromiseRef.current = null;
        throw error;
      })
      .finally(() => {
        workspaceInitPromiseRef.current = null;
      });

    workspaceInitPromiseRef.current = initPromise;

    return workspaceInitPromiseRef.current;
  };

  const showNoticeFromError = (
    error: unknown,
    fallbackMessage: string,
    tone: WorkspaceNotice['tone'] = 'error',
    overrides: Partial<WorkspaceNotice> = {}
  ) => {
    const formatted = formatEditorError(error, fallbackMessage);
    const authExpired = isAuthExpiredError(error);
    setWorkspaceNotice({
      tone,
      title: overrides.title || formatted.title,
      advice: overrides.advice || formatted.advice,
      details: overrides.details || formatted.details,
      actionLabel: overrides.actionLabel || (authExpired ? 'Sign in again' : undefined),
      actionType: overrides.actionType || (authExpired ? 'signin' : undefined),
    });
  };

  const handleWorkspaceNoticeAction = () => {
    if (!workspaceNotice?.actionType) return;

    if (workspaceNotice.actionType === 'signin') {
      onLogout();
      navigate('/');
      return;
    }

    if (workspaceNotice.actionType === 'retry-build') {
      void compileRepository();
      return;
    }

    if (workspaceNotice.actionType === 'open-preview') {
      void jumpToRelatedPreview();
    }
  };

  const copyTeamInviteCode = async () => {
    if (!teamSession?.code) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(teamSession.code);
        showTeamNotice('Invite code copied');
        return;
      }
    } catch (error) {
      console.error('Failed to copy invite code:', error);
    }

    window.prompt('Copy this invite code', teamSession.code);
  };

  const createTeamSession = async () => {
    if (!repo || teamSessionBusy) return;

    setTeamSessionBusy(true);
    setCollaborationStatus('Generating invite code…');

    try {
      const data = await apiRequest<TeamSessionData>('/team-sessions/create', {
        method: 'POST',
        body: JSON.stringify({
          repo,
          createdBy: {
            login: userData?.login,
            name: userData?.name,
          }
        })
      }, 'Failed to create team session');

      persistTeamSession(data);
      setCollaborationEnabled(true);
      setCollaborationStatus('Invite code ready');
      showTeamNotice(`Team code ${data.code} is ready`);
      setWorkspaceNotice(null);
    } catch (error) {
      console.error('Create team session error:', error);
      setCollaborationEnabled(false);
      showNoticeFromError(error, 'Failed to create invite code');
      setCollaborationStatus(error instanceof Error ? error.message : 'Failed to create invite code');
    } finally {
      setTeamSessionBusy(false);
    }
  };

  const switchToSoloMode = () => {
    persistTeamSession(null);
    setCollaborationEnabled(false);
    setCollaborationStatus('');
    setCollaborators([]);
    showTeamNotice('Solo mode enabled');
  };

  const switchToTeamMode = () => {
    setCollaborationEnabled(true);
    if (teamSession?.code) {
      setCollaborationStatus('Team room ready');
      return;
    }

    void createTeamSession();
  };

  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    sidebarResizeRef.current = {
      isResizing: true,
      startX: e.clientX,
      startWidth: sidebarWidth
    };
    
    document.addEventListener('mousemove', handleSidebarResize);
    document.addEventListener('mouseup', handleSidebarResizeStop);
  };

  const handleSidebarResize = (e: MouseEvent) => {
    if (!sidebarResizeRef.current.isResizing) return;
    
    const delta = e.clientX - sidebarResizeRef.current.startX;
    const newWidth = Math.max(200, Math.min(500, sidebarResizeRef.current.startWidth + delta));
    setSidebarWidth(newWidth);
  };

  const handleSidebarResizeStop = () => {
    sidebarResizeRef.current.isResizing = false;
    document.removeEventListener('mousemove', handleSidebarResize);
    document.removeEventListener('mouseup', handleSidebarResizeStop);
  };

  const handleEditorResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    editorResizeRef.current = {
      isResizing: true,
      startX: e.clientX,
      startWidth: editorWidth
    };
    
    document.addEventListener('mousemove', handleEditorResize);
    document.addEventListener('mouseup', handleEditorResizeStop);
  };

  const handleEditorResize = (e: MouseEvent) => {
    if (!editorResizeRef.current.isResizing) return;
    
    const containerWidth = window.innerWidth - (sidebarOpen ? sidebarWidth + 12 : 0);
    const delta = ((e.clientX - editorResizeRef.current.startX) / containerWidth) * 100;
    const newWidth = Math.max(30, Math.min(70, editorResizeRef.current.startWidth + delta));
    setEditorWidth(newWidth);
  };

  const handleEditorResizeStop = () => {
    editorResizeRef.current.isResizing = false;
    document.removeEventListener('mousemove', handleEditorResize);
    document.removeEventListener('mouseup', handleEditorResizeStop);
  };

  const handleTerminalResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    terminalResizeRef.current = {
      isResizing: true,
      startY: e.clientY,
      startHeight: bottomPanelHeight
    };
    
    document.addEventListener('mousemove', handleTerminalResize);
    document.addEventListener('mouseup', handleTerminalResizeStop);
  };

  const handleTerminalResize = (e: MouseEvent) => {
    if (!terminalResizeRef.current.isResizing) return;
    
    const delta = terminalResizeRef.current.startY - e.clientY;
    const newHeight = Math.max(150, Math.min(600, terminalResizeRef.current.startHeight + delta));
    setBottomPanelHeight(newHeight);
  };

  const handleTerminalResizeStop = () => {
    terminalResizeRef.current.isResizing = false;
    document.removeEventListener('mousemove', handleTerminalResize);
    document.removeEventListener('mouseup', handleTerminalResizeStop);
  };

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorReady(true);
    setSelectedReviewLine(editor.getPosition()?.lineNumber ?? 1);

    applyHandshakeTheme(monaco);
    
    editor.updateOptions({
      fontSize: 14,
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
      fontLigatures: true,
      renderLineHighlight: 'all',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderWhitespace: 'selection',
      minimap: {
        enabled: true,
        maxColumn: 80
      },
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10
      },
      lineNumbers: 'on',
      glyphMargin: true,
      folding: true,
      lineDecorationsWidth: 10,
      lineNumbersMinChars: 4,
      renderLineHighlightOnlyWhenFocus: false,
      roundedSelection: true,
      selectOnLineNumbers: true,
      readOnly: false,
      automaticLayout: true,
      wordWrap: 'on',
      wrappingStrategy: 'advanced',
      bracketPairColorization: {
        enabled: true,
        independentColorPoolPerBracketType: true
      },
      guides: {
        bracketPairs: true,
        bracketPairsHorizontal: 'active',
        highlightActiveBracketPair: true,
        indentation: true,
        highlightActiveIndentation: true
      }
    });

    editor.onDidChangeCursorPosition((event) => {
      setSelectedReviewLine(event.position.lineNumber);
    });
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const data = await apiRequest<UserData>('/user', {}, 'Failed to fetch user profile');
        setUserData(data);
      } catch (error) {
        console.error('Error fetching user data:', error);
        showNoticeFromError(error, 'Failed to fetch user profile');
      }
    };
    
    void fetchUserData();
    // Load the signed-in user once when the editor shell mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleViewportResize = () => {
      const nextIsCompact = isCompactEditorViewport();
      setIsCompactViewport(nextIsCompact);

      if (nextIsCompact && !wasCompactViewportRef.current) {
        setSidebarOpen(false);
      }

      wasCompactViewportRef.current = nextIsCompact;
    };

    handleViewportResize();
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  const fetchUserRepos = async () => {
    try {
      const data = await apiRequest<RepositorySearchResult[]>('/repos', {}, 'Failed to fetch repositories');
      setUserRepos(data);
    } catch (error) {
      console.error('Error fetching repositories:', error);
      showNoticeFromError(error, 'Failed to fetch repositories');
    }
  };

  useEffect(() => {
    const initializeRepo = async () => {
      let repoData = sessionStorage.getItem('selectedRepo');
      
      if (!repoData) {
        const repoParam = searchParams.get('repo');
        if (repoParam) {
          const [owner, name] = repoParam.split('/');
          if (owner && name) {
            const newRepoData = {
              owner,
              name,
              fullName: `${owner}/${name}`,
              defaultBranch: 'main'
            };
            sessionStorage.setItem('selectedRepo', JSON.stringify(newRepoData));
            repoData = JSON.stringify(newRepoData);
          }
        }
      }

      if (repoData) {
        try {
          const parsed = JSON.parse(repoData);
          
          if (!parsed.owner || !parsed.name) {
            navigate('/repo-input');
            return;
          }
          
          setRepo(parsed);
          setActiveRepoKey(parsed.fullName);
          setOpenRepoKeys((prev) =>
            prev.includes(parsed.fullName) ? prev : [...prev, parsed.fullName],
          );

          setLoading(true);
          setLoadingMessage('Initializing repository environment...');
          const workspace = await initializeWorkspaceSession(parsed, { hydrateTree: true });
          if (!workspace?.sessionId) {
            throw new Error('Failed to prepare the repository workspace');
          }

          if (initialStoredTeamSessionRef.current?.repo?.fullName && initialStoredTeamSessionRef.current.repo.fullName !== parsed.fullName) {
            persistTeamSession(null);
            setCollaborationEnabled(false);
          }

          if (!Array.isArray(workspace.tree) || workspace.tree.length === 0) {
            setLoadingMessage('Fetching file tree...');
            await fetchFileTree(parsed);
          } else {
            setLoading(false);
          }
          
          if (autoCompile) {
            setLoadingMessage('Performing initial build...');
            setTimeout(() => compileRepository(parsed), 100);
          }
        } catch (error) {
          console.error('Error parsing repository data:', error);
          setLoading(false);
          navigate('/repo-input');
        }
      } else {
        setLoading(false);
        navigate('/repo-input');
      }
    };

    initializeRepo();
    // Repository initialization intentionally runs from the route/session seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, navigate, autoCompile]);

  useEffect(() => {
    return () => {
      void leaveCollaborationRoom();

      if (buildSessionId) {
        fetch(`${API_URL}/build/cleanup`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sessionId: buildSessionId })
        }).catch(() => {});
      }
      
      if (rebuildTimer.current) {
        clearTimeout(rebuildTimer.current);
      }

      if (livePreviewTimerRef.current) {
        clearTimeout(livePreviewTimerRef.current);
      }
    };
    // Unmount cleanup should use the session/timer refs captured by the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn the user before leaving when there are unsaved changes
  useEffect(() => {
    if (unsavedTabs.length === 0) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Modern browsers show their own message; setting returnValue keeps legacy support
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsavedTabs.length]);

  // GoLive: keep srcDocContent in sync when the user switches tabs
  useEffect(() => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) { setSrcDocContent(null); return; }
    if (tab.language === 'html') {
      const baseHref = getPreviewBaseHref(previewUrl, API_URL);
      setSrcDocContent(prepareHtmlForSrcDoc(tab.content, baseHref, tab.path));
      setCompilationModeState('repository');
    } else {
      setSrcDocContent(null);
    }
  }, [API_URL, activeTabId, liveEditMode, previewUrl, tabs]);

  useEffect(() => {
    activeTabRef.current = activeTab || null;
  }, [activeTab]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!monaco || !model) return;

    if (!activeTab || !isMathValidatableFile(activeTab.path)) {
      monaco.editor.setModelMarkers(model, 'proofdesk-math', []);
      return;
    }

    if (mathValidationTimerRef.current !== null) {
      window.clearTimeout(mathValidationTimerRef.current);
    }

    const content = activeTab.content;
    const path = activeTab.path;
    mathValidationTimerRef.current = window.setTimeout(() => {
      const latestEditor = editorRef.current;
      const latestModel = latestEditor?.getModel?.();
      const latestMonaco = monacoRef.current;
      if (!latestModel || !latestMonaco) return;
      if (activeTabRef.current?.path !== path) return;

      const issues = validateMathInBuffer(content, path);
      const markers = issues.map((issue) => ({
        severity: latestMonaco.MarkerSeverity.Error,
        message: issue.message,
        source: issue.source,
        startLineNumber: issue.startLineNumber,
        startColumn: issue.startColumn,
        endLineNumber: issue.endLineNumber,
        endColumn: issue.endColumn,
      }));
      latestMonaco.editor.setModelMarkers(latestModel, 'proofdesk-math', markers);
    }, 300);

    return () => {
      if (mathValidationTimerRef.current !== null) {
        window.clearTimeout(mathValidationTimerRef.current);
        mathValidationTimerRef.current = null;
      }
    };
  }, [activeTab, editorReady]);

  // Slice 2: PreTeXt tag structure validation (nesting rules, unmatched tags)
  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!monaco || !model) return;

    if (!activeTab || !isPtxFile(activeTab.path)) {
      monaco.editor.setModelMarkers(model, 'proofdesk-ptx', []);
      return;
    }

    if (ptxValidationTimerRef.current !== null) {
      window.clearTimeout(ptxValidationTimerRef.current);
    }

    const content = activeTab.content;
    const path = activeTab.path;
    ptxValidationTimerRef.current = window.setTimeout(() => {
      const latestEditor = editorRef.current;
      const latestModel = latestEditor?.getModel?.();
      const latestMonaco = monacoRef.current;
      if (!latestModel || !latestMonaco) return;
      if (activeTabRef.current?.path !== path) return;

      const issues = validatePtxBuffer(content, path);
      const markers = issues.map((issue) => ({
        severity: issue.severity === 'error'
          ? latestMonaco.MarkerSeverity.Error
          : latestMonaco.MarkerSeverity.Warning,
        message: issue.message,
        source: issue.source,
        startLineNumber: issue.startLineNumber,
        startColumn: issue.startColumn,
        endLineNumber: issue.endLineNumber,
        endColumn: issue.endColumn,
      }));
      latestMonaco.editor.setModelMarkers(latestModel, 'proofdesk-ptx', markers);
    }, 300);

    return () => {
      if (ptxValidationTimerRef.current !== null) {
        window.clearTimeout(ptxValidationTimerRef.current);
        ptxValidationTimerRef.current = null;
      }
    };
  }, [activeTab, editorReady]);

  // Apply build-error markers for the currently visible tab whenever the
  // active tab or the set of build errors changes.
  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel?.();
    if (!monaco || !model) return;
    if (!activeTab || buildErrors.length === 0) {
      monaco.editor.setModelMarkers(model, 'proofdesk-build', []);
      return;
    }
    const tabErrors = buildErrors.filter(
      (e) => e.filePath === activeTab.path || e.filePath.endsWith(activeTab.name),
    );
    monaco.editor.setModelMarkers(
      model,
      'proofdesk-build',
      tabErrors.map((e) => ({
        startLineNumber: e.startLineNumber,
        startColumn: e.startColumn,
        endLineNumber: e.endLineNumber,
        endColumn: e.endColumn,
        message: e.message,
        severity: e.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
        source: 'Build',
      })),
    );
  }, [activeTabId, buildErrors, editorReady]);

  useEffect(() => {
    const editorInstance = editorRef.current;
    const monaco = monacoRef.current;
    const model = editorInstance?.getModel?.();
    if (!editorInstance || !monaco || !model) return;

    reviewDecorationIdsRef.current = editorInstance.deltaDecorations(
      reviewDecorationIdsRef.current,
      activeReviewThreads.map((thread) => ({
        range: new monaco.Range(thread.lineNumber, 1, thread.lineNumber, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: thread.status === 'open' ? 'proofdesk-review-glyph-open' : 'proofdesk-review-glyph-resolved',
          glyphMarginHoverMessage: [{ value: `Review thread on line ${thread.lineNumber} (${thread.status})` }],
          linesDecorationsClassName: thread.status === 'open' ? 'proofdesk-review-line-open' : 'proofdesk-review-line-resolved',
        },
      }))
    );
  }, [activeReviewThreads, activeTabId, editorReady]);

  useEffect(() => {
    setRecentFiles(readRecentFiles(repo?.fullName || null));
    setReviewMarkers(readReviewMarkers(repo?.fullName || null));
  }, [repo?.fullName]);

  // When a workspace session is ready, load persisted review markers from the backend
  // and merge them on top of any locally-stored markers so no data is lost.
  useEffect(() => {
    if (!buildSessionId) return;

    void apiRequest<Record<string, ReviewMarkerEntry>>(
      `/workspace/${buildSessionId}/review-markers`,
      {},
      'Failed to load review markers'
    ).then((serverMarkers) => {
      setReviewMarkers((local) => ({ ...local, ...serverMarkers }));
    }).catch(() => {
      // Non-fatal: local markers remain in use
    });
    // Review markers are loaded when the workspace session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildSessionId]);

  useEffect(() => {
    if (!buildSessionId) {
      setPreviewHistory([]);
      setPreviewBaseSnapshotId(null);
      setPreviewDiffEnabled(false);
      return;
    }

    void loadPreviewHistory(buildSessionId);
    // Preview history is tied to the active build session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildSessionId]);

  useEffect(() => {
    if (previewHistory.length < 2) {
      setPreviewDiffEnabled(false);
      setPreviewBaseSnapshotId(null);
    } else if (!previewBaseSnapshotId) {
      setPreviewBaseSnapshotId(previewHistory[1]?.snapshotId || null);
    }
  }, [previewBaseSnapshotId, previewHistory]);

  useEffect(() => {
    if (!activeTab || !repo?.fullName) {
      setReviewStatus('needs-review');
      setReviewNote('');
      setReviewCommentDraft('');
      return;
    }

    const existingMarker = reviewMarkers[activeTab.path];
    if (existingMarker) {
      setReviewStatus(existingMarker.status === 'ready' ? 'approved' : existingMarker.status);
      setReviewNote(existingMarker.note);
      setReviewCommentDraft('');
      return;
    }

    setReviewStatus('needs-review');
    setReviewNote('');
    setReviewCommentDraft('');
  }, [activeTab, activeTabId, repo?.fullName, reviewMarkers]);

  useEffect(() => {
    liveEditModeRef.current = liveEditMode;
  }, [liveEditMode]);

  useEffect(() => {
    compilationModeRef.current = compilationMode;
  }, [compilationMode]);

  useEffect(() => {
    buildSessionIdRef.current = buildSessionId;
  }, [buildSessionId]);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    previewEntryFileRef.current = previewEntryFile;
  }, [previewEntryFile]);

  useEffect(() => {
    const testWindow = window as EditorTestWindow;
    if (!testWindow.__MRA_TEST__) return undefined;

    let animationFrameId = 0;
    const syncEditorReadiness = () => {
      testWindow.__mraIsActiveEditorReady = Boolean(
        editorRef.current?.getModel?.() && activeTabRef.current?.path && activeTabIdRef.current
      );
      animationFrameId = window.requestAnimationFrame(syncEditorReadiness);
    };

    testWindow.__mraSetActiveEditorValue = (value: string) => {
      const model = editorRef.current?.getModel?.();
      if (!model) {
        throw new Error('Editor model is not ready');
      }
      suppressEditorChangeRef.current = true;
      model.setValue(value);
      applyEditorValueChange(value, activeTabRef.current);
    };
    syncEditorReadiness();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      delete testWindow.__mraSetActiveEditorValue;
      delete testWindow.__mraIsActiveEditorReady;
    };
    // Test-only hook mirrors the current active editor through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, editorReady]);

  useEffect(() => {
    const testWindow = window as EditorTestWindow;
    if (!testWindow.__MRA_TEST__) return;

    testWindow.__mraCollaborationSnapshot = {
      count: collaborators.length,
      status: collaborationStatus,
      enabled: collaborationEnabled,
      teamCode: teamSession?.code || null,
      repoFullName: repo?.fullName || null,
      activePath: activeTab?.path || null,
      userLogin: userData?.login || null,
      editorReady,
      hasEditor: Boolean(editorRef.current),
      roomId: buildCollaborationRoomId(teamSession?.code, activeTab?.path),
      sessionActive: Boolean(collabSessionRef.current),
    };
  }, [
    activeTab?.path,
    collaborationEnabled,
    collaborationStatus,
    collaborators,
    editorReady,
    repo?.fullName,
    teamSession?.code,
    userData?.login,
  ]);

  useEffect(() => {
    const testWindow = window as EditorTestWindow;
    if (!testWindow.__MRA_TEST__) return;

    const collectFilePaths = (items: FileNode[]): string[] =>
      items.flatMap((item) => {
        const childPaths = folderContents[item.path] ? collectFilePaths(folderContents[item.path]) : [];
        return [item.path, ...childPaths];
      });

    testWindow.__mraWorkspaceSnapshot = {
      loading,
      repoFullName: repo?.fullName || null,
      filePaths: collectFilePaths(fileTree),
    };
  }, [fileTree, folderContents, loading, repo?.fullName]);

  const leaveCollaborationRoom = async (roomId: string | null = collabRoomIdRef.current) => {
    collabSessionRef.current?.destroy();
    collabSessionRef.current = null;
    if (!roomId) {
      collabRoomIdRef.current = null;
      setCollaborators([]);
      return;
    }

    collabRoomIdRef.current = null;
    setCollaborators([]);
  };

  useEffect(() => {
    if (!liveEditMode || compilationMode !== 'repository' || !repo || buildSessionId || buildInitPromiseRef.current) {
      return;
    }

    setLiveEditStatus('Preparing live preview…');
    void ensureBuildSession({ quiet: true, statusMessage: 'Preparing live preview…' });
    // This preparation guard is driven by visible live-edit state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEditMode, compilationMode, repo, buildSessionId]);

  useEffect(() => {
    if (!collaborationEnabled || !teamSession?.code || !repo || !activeTab || !userData || !editorReady || !editorRef.current) {
      void leaveCollaborationRoom();
      if (!collaborationEnabled) {
        setCollaborationStatus('');
      } else if (!teamSession?.code) {
        setCollaborationStatus(teamSessionBusy ? 'Generating invite code…' : 'Switch to team mode to start collaboration');
      }
      return;
    }

    const roomId = buildCollaborationRoomId(teamSession?.code, activeTab?.path);
    const model = editorRef.current.getModel?.();

    if (!roomId) {
      setCollaborationStatus('Team room unavailable');
      return;
    }

    if (!model) {
      setCollaborationStatus('Preparing team room…');
      const retryTimer = window.setTimeout(() => {
        setCollaborationRetryKey((key) => key + 1);
      }, 150);
      return () => window.clearTimeout(retryTimer);
    }

    collabSessionRef.current?.destroy();
    collabSessionRef.current = null;
    collabRoomIdRef.current = roomId;
    setCollaborators([]);

    const session = new MonacoYjsCollaborationSession({
      serverUrl: API_URL,
      roomId,
      editor: editorRef.current,
      model,
      initialContent: activeTab.content,
      user: {
        clientId: collabClientIdRef.current,
        login: userData.login,
        name: userData.name,
        avatarUrl: userData.avatar_url,
        color: getCollaborationColor(collabClientIdRef.current),
      },
      onStatus: setCollaborationStatus,
      onParticipantsChange: (participants) => {
        setCollaborators(participants);
        if (participants.length <= 1) return;
        setCollaborationStatus(`${participants.length} people in this file`);
      },
      onRemoteContent: (content) => {
        const latestTab = activeTabRef.current?.id === activeTab.id
          ? activeTabRef.current
          : activeTab;

        if (!latestTab || latestTab.content === content) return;

        applyRemoteEditorUpdate({
          activeTab: activeTabRef.current,
          content,
          editor: editorRef.current,
          setCollaborationStatus,
          suppressEditorChangeRef,
          tab: latestTab,
          updateTabContent,
        });
        void syncCollaborativePreview({
          apiUrl: API_URL,
          buildSessionId: buildSessionIdRef.current,
          compilationMode: compilationModeRef.current,
          ensureBuildSession,
          enqueueRebuild,
          liveEditMode: liveEditModeRef.current,
          latestEditTokenRef,
          previewUrl: previewUrlRef.current,
          setSrcDocContent,
          tab: latestTab,
          triggerQuickUpdate,
          value: content,
        });
      },
    });

    collabSessionRef.current = session;
    session.connect();

    return () => {
      if (collabSessionRef.current === session) {
        collabSessionRef.current = null;
      }
      session.destroy();
      collabRoomIdRef.current = null;
      setCollaborators([]);
    };
  // Collaboration setup is keyed to room identity; helpers read current data from refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_URL, collaborationEnabled, teamSession?.code, repo?.fullName, activeTabId, userData?.login, editorReady, collaborationRetryKey]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.profile-dropdown')) {
        setProfileDropdownOpen(false);
      }
      if (!target.closest('.repo-switcher')) {
        setShowRepoSwitcher(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const switchRepository = async (newRepo: RepositorySearchResult) => {
    const repoData: Repository = {
      owner: newRepo.owner.login,
      name: newRepo.name,
      fullName: newRepo.full_name,
      defaultBranch: newRepo.default_branch || 'main',
    };
    const repoKey = repoData.fullName;
    setShowRepoSwitcher(false);

    // Already active — nothing to do
    if (repoKey === repo?.fullName) return;

    // Already open in a background tab — just switch to it
    if (workspaceSnapshots.current.has(repoKey)) {
      saveCurrentSnapshot();
      restoreFromSnapshot(workspaceSnapshots.current.get(repoKey)!);
      setActiveRepoKey(repoKey);
      sessionStorage.setItem('selectedRepo', JSON.stringify(repoData));
      return;
    }

    // New repo — snapshot current state and initialize the new workspace
    saveCurrentSnapshot();
    setOpenRepoKeys((prev) => (prev.includes(repoKey) ? prev : [...prev, repoKey]));
    setActiveRepoKey(repoKey);
    sessionStorage.removeItem('teamSession');
    sessionStorage.setItem('selectedRepo', JSON.stringify(repoData));

    // Reset active workspace state
    setRepo(repoData);
    buildSessionIdRef.current = null;
    workspaceInitPromiseRef.current = null;
    buildInitPromiseRef.current = null;
    rebuildInFlightRef.current = false;
    queuedRebuildRef.current = null;
    activeTabIdRef.current = null;
    activeTabRef.current = null;
    previewUrlRef.current = null;
    previewEntryFileRef.current = null;
    setBuildSessionId(null);
    setTabs([]);
    setActiveTabId(null);
    setFileTree([]);
    setFolderContents({});
    setBuildResult(null);
    setBuildErrors([]);
    setPreviewUrl(null);
    setPreviewEntryFile(null);
    setPreviewHistory([]);
    setPreviewBaseSnapshotId(null);
    setPreviewDiffEnabled(false);
    setExpandedFolders(new Set());
    setRecentFiles([]);
    setSrcDocContent(null);
    setWorkspaceNotice(null);
    setStreamingBuildSessionId(null);
    setCompiling(false);
    setSaving(false);

    setLoading(true);
    setLoadingMessage('Initializing workspace...');
    try {
      const workspace = await initializeWorkspaceSession(repoData, { hydrateTree: true });
      if (!workspace?.sessionId) throw new Error('Failed to prepare workspace');
      if (!Array.isArray(workspace.tree) || workspace.tree.length === 0) {
        await fetchFileTree(repoData);
      } else {
        setLoading(false);
      }
      if (autoCompile) {
        setTimeout(() => void compileRepository(repoData), 100);
      }
    } catch (error) {
      setLoading(false);
      showNoticeFromError(error, 'Failed to open repository');
    }
  };

  const fetchFileTree = async (repoData: Repository, path: string = ''): Promise<FileNode[] | undefined> => {
    if (path) {
      setLoadingFolders(prev => new Set(prev).add(path));
    } else {
      setLoading(true);
    }
    
    try {
      const workspaceSessionId = buildSessionIdRef.current || (await initializeWorkspaceSession(repoData))?.sessionId;
      if (!workspaceSessionId) {
        throw new EditorApiError('Workspace session is not ready yet.');
      }

      const url = `${API_URL}/workspace/${workspaceSessionId}/tree${path ? `?path=${encodeURIComponent(path)}` : ''}`;

      const data = await requestJson<FileNode[]>(url, {
        credentials: 'include',
        headers: jsonHeaders(),
      }, 'Failed to fetch file tree');
      const files = Array.isArray(data) ? data : [];

      if (path === '') {
        setFileTree(files);
      } else {
        setFolderContents(prev => ({
          ...prev,
          [path]: files
        }));
      }
      setWorkspaceNotice(null);
      return files;
    } catch (error: unknown) {
      console.error('Error fetching file tree:', error);
      if (path === '') {
        showNoticeFromError(error, 'Error loading repository files');
      }
      return undefined;
    } finally {
      if (path) {
        setLoadingFolders(prev => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      } else {
        setLoading(false);
      }
    }
  };

  const openFileInTab = async (path: string, line?: number) => {
    if (!repo) return;

    const existingTab = tabs.find(t => t.path === path);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      if (line) {
        setTimeout(() => {
          editorRef.current?.revealLineInCenter(line);
          editorRef.current?.setPosition({ lineNumber: line, column: 1 });
        }, 50);
      }
      return;
    }

    setCompilationModeState('file');

    try {
      const workspaceSessionId = buildSessionIdRef.current || (await initializeWorkspaceSession(repo))?.sessionId;
      if (!workspaceSessionId) {
        throw new EditorApiError('Workspace session is not ready yet.');
      }

      const data = await apiRequest<{
        decoded_content?: string;
        sha: string;
      }>(
        `/workspace/${workspaceSessionId}/contents/${path}`,
        {},
        `Failed to open ${path}`
      );
      const content = data.decoded_content || '';

      const lang = getLanguageFromFilename(path);
      const newTab: Tab = {
        id: Date.now().toString(),
        path,
        name: path.split('/').pop() || '',
        content,
        originalContent: content,
        sha: data.sha,
        hasUnsavedChanges: false,
        language: lang
      };

      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
      setRecentFiles(pushRecentFile(repo.fullName, { path, name: newTab.name }));
      setWorkspaceNotice(null);
      if (line) {
        setTimeout(() => {
          editorRef.current?.revealLineInCenter(line);
          editorRef.current?.setPosition({ lineNumber: line, column: 1 });
        }, 150);
      }

      // GoLive: for HTML files, show instant srcDoc preview and switch to repo mode
      if (lang === 'html') {
        setCompilationModeState('repository');
        const baseHref = getPreviewBaseHref(previewUrl, API_URL);
        setSrcDocContent(prepareHtmlForSrcDoc(content, baseHref, path));
      } else if (autoCompile) {
        void compileCode(newTab.name, content);
      }
    } catch (error) {
      console.error('Error fetching file:', error);
      showNoticeFromError(error, `Failed to open ${path}`);
    }
  };

  const closeTab = (tabId: string) => {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);
    
    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
        setActiveTabId(newTabs[newActiveIndex].id);
      } else {
        setActiveTabId(null);
      }
    }
  };

  const closeAllTabs = () => {
    const hasUnsaved = tabs.some(t => t.hasUnsavedChanges);
    if (hasUnsaved) {
      if (!confirm('You have unsaved changes. Close all tabs anyway?')) {
        return;
      }
    }
    setTabs([]);
    setActiveTabId(null);
  };

  const closeOtherTabs = (tabId: string) => {
    const tabToKeep = tabs.find(t => t.id === tabId);
    if (tabToKeep) {
      setTabs([tabToKeep]);
      setActiveTabId(tabId);
    }
  };

  const updateTabContent = (tabId: string, content: string) => {
    setTabs(prev => prev.map(tab => 
      tab.id === tabId 
        ? { ...tab, content, hasUnsavedChanges: content !== tab.originalContent }
        : tab
    ));
  };

  const persistReviewMarkersToBackend = (markers: Record<string, ReviewMarkerEntry>) => {
    const sessionId = buildSessionIdRef.current;
    if (!sessionId) return;
    void apiRequest(`/workspace/${sessionId}/review-markers`, {
      method: 'PUT',
      body: JSON.stringify(markers),
    }, 'Failed to save review markers').catch(() => {});
  };

  const buildReviewAuthor = () => userData?.name || userData?.login || 'Reviewer';

  const saveReviewMarkersState = (nextMarkers: Record<string, ReviewMarkerEntry>) => {
    setReviewMarkers(nextMarkers);
    persistReviewMarkersToBackend(nextMarkers);
  };

  const saveReviewMarker = () => {
    if (!repo?.fullName || !activeTab) return;

    const nextMarkers = upsertReviewMarker(repo.fullName, {
      path: activeTab.path,
      status: reviewStatus,
      note: reviewNote.trim(),
      threads: reviewMarkers[activeTab.path]?.threads || [],
    });
    saveReviewMarkersState(nextMarkers);
    setWorkspaceNotice({
      tone: 'success',
      title: `${activeTab.name} marked as ${getReviewMarkerLabel(reviewStatus).toLowerCase()}`,
      advice: reviewNote.trim() ? 'Review note saved for this file.' : 'Status saved for this file.',
    });
  };

  const clearReviewMarker = (filePath: string = activeTab?.path || '') => {
    if (!repo?.fullName || !filePath) return;

    const nextMarkers = removeReviewMarker(repo.fullName, filePath);
    saveReviewMarkersState(nextMarkers);
    if (activeTab?.path === filePath) {
      setReviewStatus('needs-review');
      setReviewNote('');
      setReviewCommentDraft('');
    }
  };

  const addReviewComment = () => {
    if (!repo?.fullName || !activeTab || !selectedReviewLine || !reviewCommentDraft.trim()) return;

    const currentEntry = reviewMarkers[activeTab.path];
    const author = buildReviewAuthor();
    const comment: ReviewCommentEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      author,
      message: reviewCommentDraft.trim(),
      createdAt: new Date().toISOString(),
    };

    const existingThreads = currentEntry?.threads || [];
    const matchingThread = existingThreads.find((thread) => thread.lineNumber === selectedReviewLine && thread.status === 'open');
    const nextThreads = matchingThread
      ? existingThreads.map((thread) =>
          thread.id === matchingThread.id
            ? {
                ...thread,
                comments: [...thread.comments, comment],
                updatedAt: comment.createdAt,
              }
            : thread
        )
      : [
          ...existingThreads,
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            lineNumber: selectedReviewLine,
            status: 'open' as const,
            comments: [comment],
            updatedAt: comment.createdAt,
          },
        ];

    const nextMarkers = upsertReviewMarker(repo.fullName, {
      path: activeTab.path,
      status: currentEntry?.status || reviewStatus,
      note: currentEntry?.note || reviewNote.trim(),
      threads: nextThreads,
    });
    saveReviewMarkersState(nextMarkers);
    setReviewCommentDraft('');
    setWorkspaceNotice({
      tone: 'success',
      title: `Comment added on line ${selectedReviewLine}`,
      advice: 'The review thread is now attached to this file and will stay with the workspace.',
    });
  };

  const updateReviewThreadState = (threadId: string, status: 'open' | 'resolved') => {
    if (!repo?.fullName || !activeTab) return;
    const currentEntry = reviewMarkers[activeTab.path];
    if (!currentEntry) return;

    const nextMarkers = upsertReviewMarker(repo.fullName, {
      path: activeTab.path,
      status: currentEntry.status,
      note: currentEntry.note,
      threads: (currentEntry.threads || []).map((thread) =>
        thread.id === threadId
          ? {
              ...thread,
              status,
              updatedAt: new Date().toISOString(),
            }
          : thread
      ),
    });
    saveReviewMarkersState(nextMarkers);
  };

  const jumpToRelatedPreview = async () => {
    const sessionId = buildSessionIdRef.current || await ensureBuildSession({ quiet: true, statusMessage: 'Preparing preview…' });
    if (!sessionId) {
      showNoticeFromError(
        new EditorApiError('Preview session is not ready yet.'),
        'Preview session is not ready yet',
        'info',
        { actionLabel: 'Build again', actionType: 'retry-build' }
      );
      return;
    }

    const nextTarget = resolvePreviewTarget({
      activeFilePath: activeTab?.path,
      previewEntryFile: previewEntryFileRef.current,
      artifacts: buildResult?.artifacts || [],
    });

    if (!nextTarget) {
      setWorkspaceNotice({
        tone: 'info',
        title: 'No related preview page was found for this source file.',
        advice: 'Build the repository once, then try again from a chapter or HTML source file.',
        actionLabel: 'Build again',
        actionType: 'retry-build',
      });
      return;
    }

    setSrcDocContent(null);
    setPreviewEntryFile(nextTarget);
    setPreviewUrl(buildPreviewHref(API_URL, sessionId, nextTarget));
    setCompilationModeState('repository');
    setWorkspaceNotice({
      tone: 'info',
      title: `Opened the related preview page for ${activeTab?.name || nextTarget}.`,
      advice: nextTarget,
    });
  };

  const setPreviewFromEntry = (sessionId: string, entryFile?: string | null) => {
    const resolvedEntry = entryFile || previewEntryFileRef.current;
    if (!resolvedEntry) return;
    const nextPreviewUrl = buildPreviewHref(API_URL, sessionId, resolvedEntry);

    previewEntryFileRef.current = resolvedEntry;
    previewUrlRef.current = nextPreviewUrl;
    setPreviewEntryFile(resolvedEntry);
    setPreviewUrl(nextPreviewUrl);
    setPreviewFrameKey((current) => current + 1);
    setCompiledOutput('');
  };

  const applyBuildResponse = (data: BuildResponse, options: { quiet?: boolean } = {}) => {
    const nextSessionId = data.sessionId || buildSessionId || null;
    const entryFile = data.entryFile || data.artifacts?.find((a) => a.type === '.html')?.path || null;

    if (nextSessionId) {
      buildSessionIdRef.current = nextSessionId;
      setBuildSessionId(nextSessionId);
    }
    setBuildResult(data);
    setRepoCompilationResult({
      success: data.success,
      output: data.stdout || data.stderr || '',
      projectType: data.buildType,
      fileCount: data.artifacts?.length || 0
    });

    if (!data.success) {
      // Parse build errors and surface them as inline Monaco markers
      const parsed = parseBuildErrors(
        data.stdout || '',
        data.stderr || '',
        tabs.map((t) => t.path),
      );
      setBuildErrors(
        parsed.map((e) => ({
          ...e,
          fileName: e.filePath.split('/').pop() ?? e.filePath,
        })),
      );

      setWorkspaceNotice({
        tone: 'error',
        title: data.error || 'Build failed',
        advice: data.advice || 'Review the latest source change and retry the build.',
        details: data.details || data.stderr || data.stdout || '',
        actionLabel: 'Build again',
        actionType: 'retry-build',
      });
      if (!options.quiet) {
        setPreviewUrl(null);
        setPreviewDiffEnabled(false);
        setCompiledOutput(`
          <div style="background: #1e1e1e; color: #f44336; padding: 20px; font-family: monospace;">
            <h3>Build Failed</h3>
            <pre>${data.stderr || data.stdout || 'Unknown error'}</pre>
            ${data.command ? `<p>Command: ${data.command}</p>` : ''}
          </div>
        `);
      }
      return false;
    }

    setBuildErrors([]);

    if (entryFile && nextSessionId) {
      setPreviewFromEntry(nextSessionId, entryFile);
      void loadPreviewHistory(nextSessionId, true);
      setWorkspaceNotice(null);
      return true;
    }

    if (!options.quiet) {
      setPreviewUrl(null);
      setCompiledOutput(`
        <div style="background: #1e1e1e; color: #4caf50; padding: 20px; font-family: monospace;">
          <h3>Build Output</h3>
          <pre>${data.stdout || 'Build completed'}</pre>
          <p>Build Type: ${data.buildType || 'unknown'}</p>
        </div>
      `);
    }

    return true;
  };

  const initializeBuildSession = async (
    repoData: Repository | null = repo,
    options: { quiet?: boolean; statusMessage?: string; xmlId?: string | null } = {}
  ): Promise<string | null> => {
    if (!repoData) return null;

    setCompiling(true);
    setCompilationModeState('repository');
    if (options.quiet && options.statusMessage) {
      setLiveEditStatus(options.statusMessage);
    }

    try {
      const workspaceSessionId = buildSessionIdRef.current || (await initializeWorkspaceSession(repoData))?.sessionId;
      const data = await apiRequest<BuildResponse>('/build/init', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: workspaceSessionId,
          owner: repoData.owner,
          repo: repoData.name,
          defaultBranch: repoData.defaultBranch,
          preferSeed: options.quiet === true,
          ...(options.xmlId ? { xmlId: options.xmlId } : {}),
        })
      }, 'Build initialization failed');

      // Another build is already running for this repo - show waiting UI and retry
      if ((data as { buildInProgress?: boolean }).buildInProgress) {
        setWorkspaceNotice({
          tone: 'info',
          title: 'Build already in progress',
          advice: 'A build is already running for this repository. Checking back automatically in 20 seconds...',
        });
        setTimeout(() => {
          void initializeBuildSession(repoData, options);
        }, 20000);
        return workspaceSessionId || null;
      }

      // Fresh Docker build kicked off in background — open log stream
      if ((data as { building?: boolean }).building) {
        const sid = data.sessionId || workspaceSessionId;
        if (sid) {
          buildSessionIdRef.current = sid;
          setBuildSessionId(sid);
          setStreamingBuildSessionId(sid);
        }
        return sid || null;
      }

      const applied = applyBuildResponse(data, { quiet: options.quiet });
      if (!applied && options.quiet) {
        setLiveEditStatus('Live preview unavailable');
      }
      return data.sessionId || null;
    } catch (error) {
      console.error('Repository compilation error:', error);
      if (options.quiet) {
        setLiveEditStatus('Live preview unavailable');
      } else {
        const formatted = formatEditorError(error, 'Build failed');
        setWorkspaceNotice({
          tone: 'error',
          title: formatted.title,
          advice: formatted.advice,
          details: formatted.details,
          actionLabel: 'Build again',
          actionType: 'retry-build',
        });
        setCompiledOutput(`
          <div style="background: #1e1e1e; color: #f44336; padding: 20px;">
            <h1>Build Failed</h1>
            <pre>${formatted.title}</pre>
          </div>
        `);
      }
      return null;
    } finally {
      setCompiling(false);
    }
  };

  const ensureBuildSession = async (options: { quiet?: boolean; statusMessage?: string } = {}) => {
    if (buildSessionIdRef.current && (previewUrlRef.current || previewEntryFileRef.current || buildResult?.success)) {
      return buildSessionIdRef.current;
    }

    if (buildInitPromiseRef.current) {
      return buildInitPromiseRef.current;
    }

    const initPromise = initializeBuildSession(repo, { quiet: true, ...options });
    buildInitPromiseRef.current = initPromise.finally(() => {
      buildInitPromiseRef.current = null;
    });
    return buildInitPromiseRef.current;
  };

  // Extract the first xml:id from the active PTX/XML file — used for per-section builds.
  const activeSectionXmlId = useMemo<string | null>(() => {
    if (!activeTab) return null;
    const ext = activeTab.path.split('.').pop()?.toLowerCase();
    if (ext !== 'xml' && ext !== 'ptx') return null;
    const m = /xml:id="([a-zA-Z0-9_-]+)"/.exec(activeTab.content);
    return m?.[1] ?? null;
  // Recompute when the tab or its content changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.content]);

  // Keep ref in sync so runQueuedRebuild (a closure) can read the latest value
  useEffect(() => {
    activeSectionXmlIdRef.current = activeSectionXmlId;
  }, [activeSectionXmlId]);

  const compileRepository = async (repoData: Repository | null = repo) => {
    setLiveEditStatus('');
    setSrcDocContent(null);
    await initializeBuildSession(repoData);
  };

  const compileSectionById = async () => {
    if (!activeSectionXmlId) return;
    setLiveEditStatus('');
    setSrcDocContent(null);
    await initializeBuildSession(repo, { xmlId: activeSectionXmlId });
  };

  const handleExportZip = () => {
    const sessionId = buildSessionIdRef.current;
    if (!sessionId) return;
    const a = document.createElement('a');
    a.href = `${API_URL}/build/export/${sessionId}`;
    a.download = repo ? `${repo.name}-proofdesk.zip` : 'proofdesk-export.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleExportPdf = async () => {
    const sessionId = buildSessionIdRef.current;
    if (!sessionId || pdfBuilding) return;

    setPdfBuilding(true);
    try {
      await apiRequest(`/build/pdf/${sessionId}`, { method: 'POST' });
    } catch {
      setPdfBuilding(false);
      return;
    }

    // Poll until ready
    if (pdfPollRef.current) clearInterval(pdfPollRef.current);
    pdfPollRef.current = setInterval(async () => {
      const sid = buildSessionIdRef.current;
      if (!sid) { clearInterval(pdfPollRef.current!); setPdfBuilding(false); return; }
      try {
        const { status } = await apiRequest<{ status: string }>(`/build/pdf-status/${sid}`);
        if (status === 'ready') {
          clearInterval(pdfPollRef.current!);
          setPdfBuilding(false);
          const a = document.createElement('a');
          a.href = `${API_URL}/build/pdf-download/${sid}`;
          a.download = repo ? `${repo.name}.pdf` : 'textbook.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else if (status === 'idle') {
          // Build finished but no PDF was produced
          clearInterval(pdfPollRef.current!);
          setPdfBuilding(false);
        }
      } catch {
        clearInterval(pdfPollRef.current!);
        setPdfBuilding(false);
      }
    }, 5000);
  };

  const saveFile = async (tab: Tab | undefined = activeTab) => {
    if (!tab || !tab.hasUnsavedChanges || !repo) return false;
    
    setSaving(true);
    try {
      const workspaceSessionId = buildSessionIdRef.current || (await initializeWorkspaceSession(repo))?.sessionId;
      if (!workspaceSessionId) {
        throw new EditorApiError('Workspace session is not ready yet.');
      }

      const data = await apiRequest<{ content: { sha: string } }>(
        `/workspace/${workspaceSessionId}/contents/${tab.path}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            content: tab.content,
          })
        },
        `Failed to save ${tab.name}`
      );
      setTabs(prev => prev.map(t =>
        t.id === tab.id
          ? { ...t, originalContent: tab.content, hasUnsavedChanges: false, sha: data.content.sha }
          : t
      ));
      
      console.log(`Saved ${tab.name} successfully`);
      setWorkspaceNotice({
        tone: 'success',
        title: `${tab.name} saved successfully`,
        advice: 'The workspace copy is updated and ready for review, diff, or commit.',
      });
      
      if (buildSessionId && compilationMode === 'repository') {
        setTimeout(() => {
          void compileRepository();
        }, 1000);
      }
      return true;
    } catch (error) {
      console.error('Error saving file:', error);
      showNoticeFromError(error, `Failed to save ${tab.name}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAllFiles = async (tabsToSave: Tab[] = unsavedTabs) => {
    for (const tab of tabsToSave) {
      const didSave = await saveFile(tab);
      if (!didSave) {
        return false;
      }
    }
    return true;
  };

  const openSaveReview = () => {
    if (unsavedTabs.length === 0) return;
    setPendingSaveChanges(summarizeUnsavedTabs(tabs));
    setSaveReviewOpen(true);
  };

  const compileCode = async (filename: string = 'untitled', content: string | undefined = activeTab?.content) => {
    if (compilationMode !== 'file' || !content) return;
    
    setCompiling(true);
    try {
      const data = await apiRequest<{ preview?: string; output?: string }>('/compile', {
        method: 'POST',
        body: JSON.stringify({
          filename: filename || activeTab?.name || 'untitled',
          content: content
        })
      }, `Failed to compile ${filename}`);

      setCompiledOutput(data.preview || data.output || '');
      setWorkspaceNotice(null);
    } catch (error) {
      console.error('Compilation error:', error instanceof Error ? error.message : error);
      showNoticeFromError(error, `Failed to compile ${filename}`);
      setCompiledOutput('Error compiling code');
    } finally {
      setCompiling(false);
    }
  };

  const toggleFolder = async (path: string) => {
    const newExpanded = new Set(expandedFolders);
    
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
      setExpandedFolders(newExpanded);
    } else {
      newExpanded.add(path);
      setExpandedFolders(newExpanded);
      
      if (repo && !folderContents[path] && !loadingFolders.has(path)) {
        await fetchFileTree(repo, path);
      }
    }
  };

  // GoLive quick update — writes HTML/CSS/JS to output dir without Docker rebuild
  const triggerQuickUpdate = async (filePath: string, value: string, successMessage: string = 'Preview updated') => {
    const sessionId = buildSessionIdRef.current || await ensureBuildSession({ quiet: true, statusMessage: 'Preparing live preview…' });
    if (!sessionId) return false;
    try {
      const data = await apiRequest<{ success: boolean; reason?: string }>('/build/quick-update', {
        method: 'POST',
        body: JSON.stringify({ sessionId, filePath, content: value })
      }, 'Quick preview update failed');
      if (data.success) {
        setPreviewFromEntry(sessionId);
        setLastSavedAt(new Date());
        setLiveEditStatus(successMessage);
        setWorkspaceNotice(null);
        setTimeout(() => setLiveEditStatus(''), 2000);
        return true;
      }
      setWorkspaceNotice({
        tone: 'info',
        title: data.reason || 'This file needs a full rebuild before the preview updates.',
        advice: 'Use Build to refresh the rendered page for files that cannot be hot-swapped.',
        actionLabel: 'Build again',
        actionType: 'retry-build',
      });
    } catch (err) {
      console.error('Quick update error:', err);
      showNoticeFromError(err, 'Quick preview update failed');
    }
    return false;
  };

  const runQueuedRebuild = async () => {
    if (rebuildInFlightRef.current) return;

    const next = queuedRebuildRef.current;
    if (!next) return;

    queuedRebuildRef.current = null;
    rebuildInFlightRef.current = true;
    setIsRebuilding(true);
    setCompiling(true);
    setLiveEditStatus(next.clearDraftOnSuccess ? 'Compiling draft…' : 'Updating preview…');

    try {
      const sessionId = buildSessionIdRef.current || await ensureBuildSession({ quiet: true, statusMessage: 'Preparing live preview…' });
      if (!sessionId) {
        setLiveEditStatus('Live preview unavailable');
        return;
      }

      const data = await apiRequest<BuildResponse>('/build/update', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          filePath: next.filePath,
          content: next.value,
          sectionXmlId: next.sectionXmlId,
        })
      }, 'Rebuild failed');
      const isLatestEdit = next.editToken === latestEditTokenRef.current;
      const applied = applyBuildResponse(data, { quiet: !isLatestEdit && next.clearDraftOnSuccess });

      if (!applied) {
        if (isLatestEdit) {
          setLiveEditStatus('Rebuild failed');
        }
        return;
      }

      setLastSavedAt(new Date());

      if (next.clearDraftOnSuccess && isLatestEdit) {
        setSrcDocContent(null);
      }

      if (isLatestEdit) {
        setLiveEditStatus('Compiled preview updated');
        setTimeout(() => setLiveEditStatus(''), 3000);
      }
    } catch (error) {
      console.error('Live rebuild error:', error);
      showNoticeFromError(error, 'Rebuild failed');
      setLiveEditStatus('Rebuild error');
    } finally {
      rebuildInFlightRef.current = false;
      setIsRebuilding(false);
      setCompiling(false);

      const queuedStatus = (queuedRebuildRef.current as QueuedRebuild | null)?.queuedStatus;
      if (queuedStatus) {
        setLiveEditStatus(queuedStatus);
        void runQueuedRebuild();
      }
    }
  };

  const enqueueRebuild = (
    filePath: string,
    value: string,
    options: { editToken: number; clearDraftOnSuccess: boolean; queuedStatus?: string; sectionXmlId?: string | null }
  ) => {
    queuedRebuildRef.current = {
      filePath,
      value,
      editToken: options.editToken,
      clearDraftOnSuccess: options.clearDraftOnSuccess,
      queuedStatus: options.queuedStatus || 'Changes queued…',
      sectionXmlId: options.sectionXmlId ?? null,
    };

    if (rebuildInFlightRef.current) {
      setLiveEditStatus(options.queuedStatus || 'Changes queued…');
      return;
    }

    void runQueuedRebuild();
  };

  const applyEditorValueChange = (value: string, currentTabOverride?: Tab | null) => {
    const resolvedTabId = activeTabIdRef.current || activeTabId;
    if (!resolvedTabId) return;
    const currentTab = currentTabOverride || activeTabRef.current || activeTab;
    if (!currentTab) return;
    const currentCompilationMode = compilationModeRef.current;
    const currentLiveEditMode = liveEditModeRef.current;

    updateTabContent(resolvedTabId, value);

    const editToken = Date.now();
    latestEditTokenRef.current = editToken;
    const lastDotIndex = currentTab.path.lastIndexOf('.');
    const currentExt = lastDotIndex >= 0 ? currentTab.path.slice(lastDotIndex).toLowerCase() : '';

    // GoLive path A: HTML file → instant srcDoc update (no backend needed)
    if (currentExt === '.html' || currentExt === '.htm') {
      if (livePreviewTimerRef.current !== null) {
        window.clearTimeout(livePreviewTimerRef.current);
      }
      livePreviewTimerRef.current = window.setTimeout(() => {
        const baseHref = getPreviewBaseHref(previewUrlRef.current, API_URL);
        setSrcDocContent(prepareHtmlForSrcDoc(value, baseHref, currentTab.path));
        setLiveEditStatus(currentLiveEditMode ? 'Draft updated' : '');
        void triggerQuickUpdate(currentTab.path, value, 'Compiled HTML updated');
      }, 300);
      return; // skip full rebuild for HTML
    }

    if (currentCompilationMode !== 'repository') return;

    if (rebuildTimer.current !== null) {
      window.clearTimeout(rebuildTimer.current);
    }

    if (currentLiveEditMode) {
      void ensureBuildSession({ quiet: true, statusMessage: 'Preparing live preview…' });

      if (currentExt === '.css' || currentExt === '.js') {
        rebuildTimer.current = window.setTimeout(() => {
          setLiveEditStatus('Updating preview…');
          void triggerQuickUpdate(currentTab.path, value, 'Asset preview updated');
        }, 450);
        return;
      }

      // PreTeXt / XML files: keep the last good Docker output visible while the
      // section build runs — avoids showing a broken client-side approximation.
      if (isPreTeXtFile(currentTab.name)) {
        setLiveEditStatus('Compiling…');
        rebuildTimer.current = window.setTimeout(() => {
          enqueueRebuild(currentTab.path, value, {
            editToken,
            clearDraftOnSuccess: false,
            queuedStatus: 'Compiling latest draft…',
            sectionXmlId: activeSectionXmlIdRef.current,
          });
        }, 1100);
        return;
      }

      // All other file types: full rebuild (no section scoping) (1.5 s debounce)
      rebuildTimer.current = window.setTimeout(() => {
        enqueueRebuild(currentTab.path, value, {
          editToken,
          clearDraftOnSuccess: false,
          queuedStatus: 'Compiling latest change…',
          sectionXmlId: null,
        });
      }, 1500);
    } else {
      // Normal mode: debounce 2 s then rebuild silently
      if (!buildSessionId) {
        return;
      }

      rebuildTimer.current = window.setTimeout(() => {
        enqueueRebuild(currentTab.path, value, {
          editToken,
          clearDraftOnSuccess: false,
          queuedStatus: 'Compiling latest change…',
          sectionXmlId: null,
        });
      }, 2000);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;

    if (suppressEditorChangeRef.current) {
      suppressEditorChangeRef.current = false;
      return;
    }

    applyEditorValueChange(value);
  };

  handleEditorChangeRef.current = handleEditorChange;

  if (loading && !activeTabId) {
    return (
      <div className="h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 max-w-sm text-center animate-in fade-in zoom-in-95 duration-700">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-zinc-200 border-t-indigo-600 rounded-full animate-spin shadow-lg" />
            <div className="absolute inset-0 flex items-center justify-center">
              <FolderTree className="w-6 h-6 text-indigo-600 animate-pulse" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-50 tracking-tight mb-2 uppercase">Setting Up Workspace</h2>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed italic">{loadingMessage}</p>
          </div>
          <div className="w-48 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 animate-loading" style={{ width: '40%' }} />
          </div>
        </div>
      </div>
    );
  }

  const sidebarPanelWidth = isCompactViewport
    ? 'min(300px, calc(100vw - 3.5rem))'
    : `${sidebarWidth}px`;

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      <OnboardingTour />
      <EditorTopBar
        repo={repo}
        userRepos={userRepos}
        userData={userData}
        showRepoSwitcher={showRepoSwitcher}
        setShowRepoSwitcher={setShowRepoSwitcher}
        fetchUserRepos={fetchUserRepos}
        switchRepository={switchRepository}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        openSaveReview={openSaveReview}
        saving={saving}
        unsavedCount={unsavedTabs.length}
        compileRepository={() => compileRepository()}
        compileSectionById={activeSectionXmlId ? compileSectionById : undefined}
        activeSectionXmlId={activeSectionXmlId}
        compiling={compiling}
        liveEditMode={liveEditMode}
        setLiveEditMode={setLiveEditModeState}
        setLiveEditStatus={setLiveEditStatus}
        isRebuilding={isRebuilding}
        collaborationEnabled={collaborationEnabled}
        switchToSoloMode={switchToSoloMode}
        switchToTeamMode={switchToTeamMode}
        teamSessionBusy={teamSessionBusy}
        teamSession={teamSession}
        copyTeamInviteCode={copyTeamInviteCode}
        createTeamSession={createTeamSession}
        teamSessionNotice={teamSessionNotice}
        onExportZip={handleExportZip}
        canExport={!!buildSessionId}
        onExportPdf={handleExportPdf}
        pdfBuilding={pdfBuilding}
        canExportPdf={!!buildSessionId}
        terminalOpen={terminalOpen}
        setTerminalOpen={setTerminalOpen}
        profileDropdownOpen={profileDropdownOpen}
        setProfileDropdownOpen={setProfileDropdownOpen}
        onLogout={onLogout}
        navigateToRepoInput={() => navigate('/repo-input')}
      />

      <WorkspaceNoticeBanner
        notice={workspaceNotice}
        onAction={handleWorkspaceNoticeAction}
        onDismiss={() => setWorkspaceNotice(null)}
      />

      {openRepoKeys.length >= 1 && (
        <EditorRepoTabBar
          repos={openRepoKeys.map((key): RepoTabEntry => ({
            repoKey: key,
            fullName: key,
            hasUnsaved:
              key === activeRepoKey
                ? unsavedTabs.length > 0
                : (workspaceSnapshots.current.get(key)?.tabs.some((t) => t.hasUnsavedChanges) ?? false),
          }))}
          activeRepoKey={activeRepoKey}
          onSwitch={(key) => {
            if (key === repo?.fullName) return;
            const snap = workspaceSnapshots.current.get(key);
            if (snap) {
              saveCurrentSnapshot();
              restoreFromSnapshot(snap);
              setActiveRepoKey(key);
              sessionStorage.setItem('selectedRepo', JSON.stringify(snap.repo));
            }
          }}
          onClose={closeRepo}
          onOpenNew={() => {
            fetchUserRepos();
            setShowRepoSwitcher(true);
          }}
        />
      )}

      <main className="relative flex-1 flex overflow-hidden">
        {/* Activity Rail */}
        <nav className="w-14 bg-zinc-100 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col items-center py-4 gap-4 flex-shrink-0 z-30">
          <button
            onClick={() => {
              if (activityBarTab === 'explorer' && sidebarOpen) setSidebarOpen(false);
              else {
                setActivityBarTab('explorer');
                setSidebarOpen(true);
              }
            }}
            className={`p-2.5 rounded-xl transition-all active:scale-90 ${
              activityBarTab === 'explorer' && sidebarOpen
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-zinc-900/5'
                : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800'
            }`}
            title="Repository Explorer"
          >
            <FolderTree className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => {
              if (activityBarTab === 'search' && sidebarOpen) setSidebarOpen(false);
              else {
                setActivityBarTab('search');
                setSidebarOpen(true);
              }
            }}
            className={`p-2.5 rounded-xl transition-all active:scale-90 ${
              activityBarTab === 'search' && sidebarOpen
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-zinc-900/5'
                : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800'
            }`}
            title="Global Search"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              if (activityBarTab === 'git' && sidebarOpen) setSidebarOpen(false);
              else {
                setActivityBarTab('git');
                setSidebarOpen(true);
              }
            }}
            className={`p-2.5 rounded-xl transition-all active:scale-90 ${
              activityBarTab === 'git' && sidebarOpen
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-zinc-900/5'
                : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800'
            }`}
            title="Source Control"
          >
            <GitBranch className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              if (activityBarTab === 'problems' && sidebarOpen) setSidebarOpen(false);
              else {
                setActivityBarTab('problems');
                setSidebarOpen(true);
              }
            }}
            className={`relative p-2.5 rounded-xl transition-all active:scale-90 ${
              activityBarTab === 'problems' && sidebarOpen
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-zinc-900/5'
                : allDiagnostics.some((d) => d.severity === 'error')
                  ? 'text-rose-500 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  : allDiagnostics.length > 0
                    ? 'text-amber-500 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800'
            }`}
            title="Problems"
          >
            <AlertCircle className="w-5 h-5" />
            {allDiagnostics.some((d) => d.severity === 'error') && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold px-0.5">
                {allDiagnostics.filter((d) => d.severity === 'error').length}
              </span>
            )}
          </button>

          <div className="mt-auto flex flex-col gap-4">
            <button
              onClick={() => setTerminalOpen(!terminalOpen)}
              className={`p-2.5 rounded-xl transition-all ${
                terminalOpen 
                ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30' 
                : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
              title="Toggle Terminal"
            >
              <TerminalIcon className="w-5 h-5" />
            </button>
          </div>
        </nav>

        {/* Sidebar Container */}
        {sidebarOpen && (
          <aside 
            className={`bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col flex-shrink-0 animate-in slide-in-from-left duration-300 z-20 ${
              isCompactViewport ? 'absolute bottom-0 left-14 top-0 shadow-2xl' : ''
            }`}
            style={{ width: sidebarPanelWidth }}
          >
            <div className="flex-1 overflow-hidden">
              {activityBarTab === 'explorer' && (
                <EditorExplorerPane
                  activeTab={activeTab}
                  activeTabId={activeTabId}
                  autoCompile={autoCompile}
                  compilationMode={compilationMode}
                  expandedFolders={expandedFolders}
                  fileTree={fileTree}
                  folderContents={folderContents}
                  loading={loading}
                  loadingFolders={loadingFolders}
                  recentFiles={recentFiles}
                  reviewEntries={reviewEntries}
                  reviewMarkers={reviewMarkers}
                  reviewNote={reviewNote}
                  reviewStatus={reviewStatus}
                  reviewCommentDraft={reviewCommentDraft}
                  selectedReviewLine={selectedReviewLine}
                  activeReviewThreads={activeReviewThreads}
                  reviewSummary={reviewSummary}
                  searchQuery={searchQuery}
                  setReviewCommentDraft={setReviewCommentDraft}
                  setReviewNote={setReviewNote}
                  setSelectedReviewLine={setSelectedReviewLine}
                  setReviewStatus={setReviewStatus}
                  setSearchQuery={setSearchQuery}
                  setAutoCompile={setAutoCompile}
                  setCompilationMode={setCompilationMode}
                  tabs={tabs}
                  onClearReviewMarker={clearReviewMarker}
                  onAddReviewComment={addReviewComment}
                  onOpenFile={openFileInTab}
                  onRefresh={() => {
                    if (repo) {
                      return fetchFileTree(repo).then(() => {});
                    }
                  }}
                  onReopenReviewThread={(threadId) => updateReviewThreadState(threadId, 'open')}
                  onResolveReviewThread={(threadId) => updateReviewThreadState(threadId, 'resolved')}
                  onSaveReviewMarker={saveReviewMarker}
                  onToggleFolder={toggleFolder}
                />
              )}
              
              {activityBarTab === 'search' && (
                <EditorSearchPane
                  activeTabId={activeTabId}
                  fileTree={fileTree}
                  folderContents={folderContents}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  tabs={tabs}
                  onOpenFile={openFileInTab}
                  sessionId={buildSessionId}
                  apiUrl={API_URL}
                />
              )}
              
              {activityBarTab === 'git' && repo && (
                <GitPanel
                  repo={repo}
                  apiUrl={API_URL}
                  workspaceSessionId={buildSessionId}
                  onFileClick={openFileInTab}
                  onWorkspaceRefresh={() => {
                    if (repo) {
                      void fetchFileTree(repo);
                    }
                  }}
                />
              )}

              {activityBarTab === 'problems' && (
                <EditorProblemsPane
                  diagnostics={allDiagnostics}
                  activeFilePath={activeTab?.path}
                  onNavigate={openFileInTab}
                />
              )}
            </div>

            {/* Resize Handle */}
            <div
              className={`${isCompactViewport ? 'hidden' : 'absolute'} top-0 right-0 w-1 h-full cursor-col-resize hover:bg-indigo-500/30 transition-colors z-30`}
              onMouseDown={handleSidebarResizeStart}
            />
          </aside>
        )}

        {/* Main Workspace Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-950">
          <EditorTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            setActiveTabId={(id) => setActiveTabId(id)}
            closeTab={closeTab}
            closeOtherTabs={closeOtherTabs}
            closeAllTabs={closeAllTabs}
          />

          <div className="editor-workspace-split flex-1 flex overflow-hidden">
            <PreviewPane
              compilationMode={compilationMode}
              activeTab={activeTab ? { language: activeTab.language, content: activeTab.content } : null}
              editorWidth={editorWidth}
              onEditorResizeStart={handleEditorResizeStart}
              onEditorDidMount={handleEditorDidMount}
              onEditorChange={handleEditorChange}
              MonacoEditor={MonacoEditor}
              srcDocContent={srcDocContent}
              compiling={compiling}
              liveEditStatus={liveEditStatus}
              liveEditMode={liveEditMode}
              lastSavedAt={lastSavedAt}
              collaborationEnabled={collaborationEnabled}
              collaborators={collaborators}
              collaborationStatus={collaborationStatus}
              getParticipantName={getParticipantName}
              getParticipantInitials={getParticipantInitials}
              compileRepository={() => compileRepository()}
              jumpToRelatedPreview={jumpToRelatedPreview}
              setEditorWidth={setEditorWidth}
              isRebuilding={isRebuilding}
              previewUrl={previewUrl}
              previewFrameKey={previewFrameKey}
              compiledOutput={compiledOutput}
              sessionId={buildSessionId}
              apiUrl={API_URL}
              previewHistory={previewHistory}
              previewDiffEnabled={previewDiffEnabled}
              previewBaseSnapshotId={previewBaseSnapshotId}
              onTogglePreviewDiff={() => setPreviewDiffEnabled((current) => !current)}
              onSelectPreviewBaseSnapshot={setPreviewBaseSnapshotId}
            />
          </div>

          {/* Bottom Terminal Panel */}
          {terminalOpen && (
            <div 
              className="flex flex-col bg-zinc-950 border-t border-zinc-800 animate-in slide-in-from-bottom duration-300 z-40"
              style={{ height: terminalMaximized ? '100%' : `${bottomPanelHeight}px` }}
            >
              {/* Terminal Resize Handle */}
              <div
                className="h-1 cursor-row-resize hover:bg-indigo-500 transition-colors"
                onMouseDown={handleTerminalResizeStart}
              />
              
              <div className="flex-1 overflow-hidden relative">
                <Suspense fallback={
                  <div className="flex h-full items-center justify-center bg-zinc-950">
                    <div className="flex flex-col items-center gap-3">
                      <RefreshCw className="w-6 h-6 text-zinc-700 animate-spin" />
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Initializing Terminal...</p>
                    </div>
                  </div>
                }>
                  <TerminalPanel
                    apiUrl={API_URL}
                    repo={repo}
                    buildSessionId={buildSessionId}
                    isOpen={terminalOpen}
                    onBuildSessionReady={(nextSessionId) => {
                      if (!buildSessionIdRef.current) {
                        setBuildSessionId(nextSessionId);
                      }
                    }}
                    onClose={() => setTerminalOpen(false)}
                    onToggleMaximize={() => setTerminalMaximized(!terminalMaximized)}
                    isMaximized={terminalMaximized}
                  />
                </Suspense>
              </div>
            </div>
          )}
        </div>
      </main>

      <EditorStatusBar
        compilationMode={compilationMode}
        autoCompile={autoCompile}
        repoCompilationResult={repoCompilationResult}
        openTabsCount={tabs.length}
        unsavedCount={unsavedTabs.length}
        userLogin={userData?.login}
        errorCount={allDiagnostics.filter((d) => d.severity === 'error').length}
        warningCount={allDiagnostics.filter((d) => d.severity === 'warning').length}
        onOpenProblems={() => {
          setActivityBarTab('problems');
          setSidebarOpen(true);
        }}
      />

      {streamingBuildSessionId && (
        <BuildLogPanel
          sessionId={streamingBuildSessionId}
          apiUrl={API_URL}
          onComplete={(result) => {
            setStreamingBuildSessionId(null);
            applyBuildResponse(result as BuildResponse);
          }}
          onClose={() => setStreamingBuildSessionId(null)}
        />
      )}

      <SaveReviewDialog
        isOpen={saveReviewOpen}
        changes={pendingSaveChanges}
        isSaving={saving}
        onClose={() => setSaveReviewOpen(false)}
        onConfirm={async () => {
          const savedAll = await saveAllFiles();
          if (savedAll) {
            setSaveReviewOpen(false);
          }
        }}
      />
    </div>
  );
};

export default EditorPage;
