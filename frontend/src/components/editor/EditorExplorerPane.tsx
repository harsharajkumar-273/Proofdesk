import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FolderOpen,
  History,
  Layout,
  MessageSquareText,
  Package,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { type RecentFileEntry, type ReviewMarkerEntry } from '../../utils/editorWorkspace';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

interface TabLike {
  id: string;
  path: string;
  hasUnsavedChanges: boolean;
}

interface EditorExplorerPaneProps {
  activeTabId: string | null;
  autoCompile: boolean;
  compilationMode: 'repository' | 'file';
  expandedFolders: Set<string>;
  fileTree: FileNode[];
  folderContents: Record<string, FileNode[]>;
  loading: boolean;
  loadingFolders: Set<string>;
  recentFiles: RecentFileEntry[];
  /** Review state per file path, shown as a coloured dot beside the file. */
  reviewMarkers: Record<string, ReviewMarkerEntry>;
  /** Open inline-comment threads across the workspace; a link to the Review tab appears when above zero. */
  openReviewThreads: number;
  onOpenReview: () => void;
  setAutoCompile: (value: boolean) => void;
  setCompilationMode: (value: 'repository' | 'file') => void;
  tabs: TabLike[];
  onOpenFile: (path: string, line?: number) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onToggleFolder: (path: string) => void | Promise<void>;
}

const EditorExplorerPane: React.FC<EditorExplorerPaneProps> = ({
  activeTabId,
  autoCompile,
  compilationMode,
  expandedFolders,
  fileTree,
  folderContents,
  loading,
  loadingFolders,
  recentFiles,
  reviewMarkers,
  openReviewThreads,
  onOpenReview,
  setAutoCompile,
  setCompilationMode,
  tabs,
  onOpenFile,
  onRefresh,
  onToggleFolder,
}) => {
  const renderFileTree = (items: FileNode[], level: number = 0): React.ReactElement[] =>
    items.map((item) => {
      const isFolder = item.type === 'dir';
      const isExpanded = expandedFolders.has(item.path);
      const isLoading = loadingFolders.has(item.path);
      const children = folderContents[item.path] || [];
      const isActive = tabs.find((tab) => tab.path === item.path && tab.id === activeTabId);
      const reviewMarker = reviewMarkers[item.path];

      return (
        <div key={item.path}>
          <div
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            className={`group flex items-center rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${
              isActive
                ? 'bg-indigo-50 text-indigo-700 shadow-sm dark:bg-indigo-900/20 dark:text-indigo-300'
                : 'cursor-pointer text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
            }`}
            data-file-path={item.path}
            onClick={() => {
              if (isFolder) {
                void onToggleFolder(item.path);
                return;
              }

              void onOpenFile(item.path);
            }}
          >
            {isFolder ? (
              <div className="flex items-center">
                {isLoading ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin text-indigo-500" />
                ) : isExpanded ? (
                  <ChevronDown className="mr-1.5 h-3.5 w-3.5 text-zinc-400" />
                ) : (
                  <ChevronRight className="mr-1.5 h-3.5 w-3.5 text-zinc-400" />
                )}
                <FolderOpen className={`mr-2 h-4 w-4 ${isExpanded ? 'text-indigo-500' : 'text-zinc-400 opacity-70'}`} />
              </div>
            ) : (
              <FileCode className={`mr-2 h-4 w-4 ${isActive ? 'text-indigo-500' : 'text-zinc-400 opacity-60'}`} />
            )}

            <span className="flex-1 truncate">{item.name}</span>

            {!isFolder && tabs.find((tab) => tab.path === item.path && tab.hasUnsavedChanges) && (
              <div className={`ml-1.5 h-1.5 w-1.5 rounded-full ${isActive ? 'bg-indigo-500' : 'animate-pulse bg-amber-500'}`} />
            )}

            {!isFolder && reviewMarker && (
              <div className={`ml-2 h-2 w-2 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                reviewMarker.status === 'needs-review'
                  ? 'bg-amber-500'
                  : reviewMarker.status === 'changes-requested'
                    ? 'bg-rose-500'
                    : reviewMarker.status === 'approved' || reviewMarker.status === 'ready'
                      ? 'bg-emerald-500'
                      : 'bg-indigo-500'
              }`} />
            )}
          </div>

          {isFolder && isExpanded && children.length > 0 && (
            <div className="mt-0.5">{renderFileTree(children, level + 1)}</div>
          )}
        </div>
      );
    });

  return (
    <div className="flex h-full flex-col bg-zinc-50/50 dark:bg-zinc-950/50">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/50 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Files</h3>
          <button
            onClick={() => void onRefresh()}
            className="rounded-lg p-1.5 text-zinc-400 transition-all hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 dark:hover:bg-indigo-900/20"
            title="Refresh file tree"
            aria-label="Refresh file tree"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            <button
              onClick={() => setCompilationMode('repository')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all ${
                compilationMode === 'repository'
                  ? 'bg-white text-indigo-600 shadow-sm dark:bg-zinc-700 dark:text-indigo-300'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
              }`}
            >
              <Package className="h-3 w-3" />
              Repo
            </button>
            <button
              onClick={() => setCompilationMode('file')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-all ${
                compilationMode === 'file'
                  ? 'bg-white text-indigo-600 shadow-sm dark:bg-zinc-700 dark:text-indigo-300'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
              }`}
            >
              <FileCode className="h-3 w-3" />
              File
            </button>
          </div>

          <div className="flex items-center justify-between px-1">
            <div className="group flex cursor-pointer items-center gap-2" onClick={() => setAutoCompile(!autoCompile)}>
              <div className={`relative flex h-4 w-8 items-center rounded-full transition-colors ${autoCompile ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}>
                <div className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${autoCompile ? 'translate-x-4' : 'translate-x-1'}`} />
              </div>
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Auto-compile</span>
            </div>
            {autoCompile && <Zap className="h-3 w-3 text-amber-500" />}
          </div>

          {openReviewThreads > 0 && (
            <button
              type="button"
              onClick={onOpenReview}
              className="flex w-full items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-left text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
            >
              <MessageSquareText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {openReviewThreads} open review {openReviewThreads === 1 ? 'thread' : 'threads'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-600" />
            <p className="text-xs text-zinc-400">Loading files…</p>
          </div>
        ) : (
          <div className="space-y-6 pb-20">
            <section>
              <div className="mb-3 flex items-center gap-2 px-2">
                <Layout className="h-3 w-3 text-indigo-500" />
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Workspace root</span>
              </div>
              <div className="space-y-0.5">
                {fileTree.length > 0 ? (
                  renderFileTree(fileTree)
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/50 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
                    <Package className="mx-auto mb-3 h-8 w-8 opacity-20" />
                    <p className="text-xs text-zinc-400">This folder is empty</p>
                  </div>
                )}
              </div>
            </section>

            {recentFiles.length > 0 && (
              <section className="animate-in fade-in duration-700 delay-200">
                <div className="mb-3 flex items-center gap-2 px-2">
                  <History className="h-3 w-3 text-zinc-400" />
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Recent files</span>
                </div>
                <div className="space-y-2">
                  {recentFiles.slice(0, 4).map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => void onOpenFile(entry.path)}
                      className="group w-full rounded-xl border border-zinc-200 bg-white p-3 text-left transition-all hover:border-indigo-200 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-900"
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="truncate text-[11px] font-bold text-zinc-900 transition-colors group-hover:text-indigo-600 dark:text-zinc-100">{entry.name}</span>
                        <span className="text-[10px] text-zinc-400">{new Date(entry.openedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="truncate text-[10px] text-zinc-400">{entry.path}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorExplorerPane;
