import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FolderOpen,
  History,
  Layout,
  Package,
  RefreshCw,
  Search,
  Zap,
} from 'lucide-react';
import {
  type RecentFileEntry,
  type ReviewMarkerEntry,
  type ReviewMarkerStatus,
  type ReviewThreadEntry,
} from '../../utils/editorWorkspace';
import ReviewWorkflowPanel from './ReviewWorkflowPanel';

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

interface ActiveTabLike {
  name: string;
  path: string;
}

interface EditorExplorerPaneProps {
  activeTab: ActiveTabLike | undefined;
  activeTabId: string | null;
  autoCompile: boolean;
  compilationMode: 'repository' | 'file';
  expandedFolders: Set<string>;
  fileTree: FileNode[];
  folderContents: Record<string, FileNode[]>;
  loading: boolean;
  loadingFolders: Set<string>;
  recentFiles: RecentFileEntry[];
  reviewEntries: ReviewMarkerEntry[];
  reviewMarkers: Record<string, ReviewMarkerEntry>;
  reviewNote: string;
  reviewStatus: ReviewMarkerStatus;
  reviewCommentDraft: string;
  selectedReviewLine: number | null;
  activeReviewThreads: ReviewThreadEntry[];
  reviewSummary: {
    filesTracked: number;
    approvedFiles: number;
    requestedFiles: number;
    verifyPreviewFiles: number;
    openThreads: number;
  };
  searchQuery: string;
  setReviewCommentDraft: (value: string) => void;
  setReviewNote: (value: string) => void;
  setSelectedReviewLine: (value: number) => void;
  setReviewStatus: (value: ReviewMarkerStatus) => void;
  setSearchQuery: (value: string) => void;
  setAutoCompile: (value: boolean) => void;
  setCompilationMode: (value: 'repository' | 'file') => void;
  tabs: TabLike[];
  onClearReviewMarker: (filePath: string) => void;
  onAddReviewComment: () => void;
  onOpenFile: (path: string, line?: number) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onReopenReviewThread: (threadId: string) => void;
  onResolveReviewThread: (threadId: string) => void;
  onSaveReviewMarker: () => void;
  onToggleFolder: (path: string) => void | Promise<void>;
}

const getAllFiles = (items: FileNode[], folderContents: Record<string, FileNode[]>): FileNode[] => {
  const allFiles: FileNode[] = [];
  items.forEach((item) => {
    allFiles.push(item);
    if (item.type === 'dir' && folderContents[item.path]) {
      allFiles.push(...getAllFiles(folderContents[item.path], folderContents));
    }
  });
  return allFiles;
};

const EditorExplorerPane: React.FC<EditorExplorerPaneProps> = ({
  activeTab,
  activeTabId,
  autoCompile,
  compilationMode,
  expandedFolders,
  fileTree,
  folderContents,
  loading,
  loadingFolders,
  recentFiles,
  reviewEntries,
  reviewMarkers,
  reviewNote,
  reviewStatus,
  reviewCommentDraft,
  selectedReviewLine,
  activeReviewThreads,
  reviewSummary,
  searchQuery,
  setReviewCommentDraft,
  setReviewNote,
  setSelectedReviewLine,
  setReviewStatus,
  setSearchQuery,
  setAutoCompile,
  setCompilationMode,
  tabs,
  onAddReviewComment,
  onOpenFile,
  onRefresh,
  onReopenReviewThread,
  onResolveReviewThread,
  onSaveReviewMarker,
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

  const renderSearchResults = (): React.ReactElement[] => {
    const allFiles = getAllFiles(fileTree, folderContents);
    const filtered = allFiles.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
      || item.path.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filtered.length === 0) {
      return [
        <div key="no-results" className="py-12 text-center text-zinc-400">
          <Search className="mx-auto mb-3 h-10 w-10 opacity-20" />
          <p className="text-xs font-bold uppercase tracking-widest">No Matches Found</p>
        </div>,
      ];
    }

    return filtered.map((item) => (
      <button
        key={item.path}
        className="group flex w-full items-center rounded-xl px-3 py-2 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        onClick={() => item.type === 'file' && void onOpenFile(item.path)}
      >
        {item.type === 'dir' ? (
          <FolderOpen className="mr-3 h-4 w-4 text-zinc-400 transition-colors group-hover:text-indigo-500" />
        ) : (
          <FileCode className="mr-3 h-4 w-4 text-zinc-400 transition-colors group-hover:text-indigo-500" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.name}</div>
          <div className="truncate text-[10px] font-medium uppercase tracking-tight text-zinc-400">{item.path}</div>
        </div>
      </button>
    ));
  };

  return (
    <div className="flex h-full flex-col bg-zinc-50/50 dark:bg-zinc-950/50">
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/50 p-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600">Repository Explorer</h3>
          <button
            onClick={() => void onRefresh()}
            className="rounded-lg p-1.5 text-zinc-400 transition-all hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 dark:hover:bg-indigo-900/20"
            title="Refresh File Tree"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          <ReviewWorkflowPanel
            activeFilePath={activeTab?.path}
            reviewSummary={reviewSummary}
            reviewEntries={reviewEntries}
            reviewStatus={reviewStatus}
            reviewNote={reviewNote}
            selectedReviewLine={selectedReviewLine}
            reviewCommentDraft={reviewCommentDraft}
            activeThreads={activeReviewThreads}
            setReviewStatus={setReviewStatus}
            setReviewNote={setReviewNote}
            setSelectedReviewLine={setSelectedReviewLine}
            setReviewCommentDraft={setReviewCommentDraft}
            onSaveReviewMarker={onSaveReviewMarker}
            onAddReviewComment={onAddReviewComment}
            onResolveThread={onResolveReviewThread}
            onReopenThread={onReopenReviewThread}
            onOpenFile={onOpenFile}
          />

          <div className="flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            <button
              onClick={() => setCompilationMode('repository')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
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
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
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
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-500">Auto-Compile</span>
            </div>
            {autoCompile && <Zap className="h-3 w-3 animate-pulse text-amber-500" />}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-600" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Indexing Workspace...</p>
          </div>
        ) : (
          <div className="space-y-6 pb-20">
            <section>
              <div className="mb-3 flex items-center gap-2 px-2">
                <Layout className="h-3 w-3 text-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600">Workspace Root</span>
              </div>
              <div className="space-y-0.5">
                {fileTree.length > 0 ? (
                  renderFileTree(fileTree)
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/50 py-12 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
                    <Package className="mx-auto mb-3 h-8 w-8 opacity-20" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Empty Directory</p>
                  </div>
                )}
              </div>
            </section>

            {recentFiles.length > 0 && (
              <section className="animate-in fade-in duration-700 delay-200">
                <div className="mb-3 flex items-center gap-2 px-2">
                  <History className="h-3 w-3 text-zinc-400" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600">Recents</span>
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
                        <span className="text-[9px] font-bold text-zinc-400">{new Date(entry.openedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="truncate text-[9px] font-medium uppercase tracking-tight text-zinc-400">{entry.path}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="animate-in fade-in duration-700 delay-500">
              <div className="mb-3 flex items-center gap-2 px-2">
                <Search className="h-3 w-3 text-zinc-400" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600">Global Index</span>
              </div>
              <div className="group relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 transition-colors group-focus-within:text-indigo-500" />
                <input
                  type="text"
                  placeholder="Search all files..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-10 pr-4 text-xs font-medium text-zinc-900 shadow-sm outline-none transition-all placeholder:text-zinc-400 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
              <div className="mt-4 space-y-1">
                {searchQuery.trim().length > 0 && renderSearchResults()}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorExplorerPane;
