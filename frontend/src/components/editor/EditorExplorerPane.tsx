import React from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  History,
  Package,
  Search,
  RefreshCw,
  Zap,
  Layout,
  FileCode,
  Tag,
  StickyNote,
} from 'lucide-react';
import {
  getReviewMarkerLabel,
  type RecentFileEntry,
  type ReviewMarkerEntry,
  type ReviewMarkerStatus,
} from '../../utils/editorWorkspace';

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
  searchQuery: string;
  setReviewNote: (value: string) => void;
  setReviewStatus: (value: ReviewMarkerStatus) => void;
  setSearchQuery: (value: string) => void;
  setAutoCompile: (value: boolean) => void;
  setCompilationMode: (value: 'repository' | 'file') => void;
  tabs: TabLike[];
  onClearReviewMarker: (filePath: string) => void;
  onOpenFile: (path: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onSaveReviewMarker: () => void;
  onToggleFolder: (path: string) => void | Promise<void>;
}

const getMarkerChipClassName = (status: ReviewMarkerStatus) => {
  switch (status) {
    case 'needs-review':
      return 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50';
    case 'verify-preview':
      return 'bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/50';
    case 'ready':
      return 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50';
    default:
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  }
};

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
  searchQuery,
  setReviewNote,
  setReviewStatus,
  setSearchQuery,
  setAutoCompile,
  setCompilationMode,
  tabs,
  onClearReviewMarker,
  onOpenFile,
  onRefresh,
  onSaveReviewMarker,
  onToggleFolder,
}) => {
  const renderFileTree = (items: FileNode[], level: number = 0): React.ReactElement[] => (
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
            className={`group flex items-center py-1.5 px-2 rounded-lg cursor-pointer text-sm font-medium transition-all ${
              isActive 
              ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 shadow-sm' 
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
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
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin text-indigo-500" />
                ) : isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                )}
                <FolderOpen className={`w-4 h-4 mr-2 ${isExpanded ? 'text-indigo-500' : 'text-zinc-400 opacity-70'}`} />
              </div>
            ) : (
              <FileCode className={`w-4 h-4 mr-2 ${isActive ? 'text-indigo-500' : 'text-zinc-400 opacity-60'}`} />
            )}

            <span className="truncate flex-1">{item.name}</span>

            {!isFolder && tabs.find((tab) => tab.path === item.path && tab.hasUnsavedChanges) && (
              <div className={`w-1.5 h-1.5 rounded-full ml-1.5 ${isActive ? 'bg-indigo-500' : 'bg-amber-500 animate-pulse'}`} />
            )}

            {!isFolder && reviewMarker && (
              <div className={`ml-auto w-2 h-2 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                reviewMarker.status === 'needs-review' ? 'bg-amber-500' : 
                reviewMarker.status === 'ready' ? 'bg-emerald-500' : 'bg-indigo-500'
              }`} />
            )}
          </div>

          {isFolder && isExpanded && children.length > 0 && (
            <div className="mt-0.5">{renderFileTree(children, level + 1)}</div>
          )}
        </div>
      );
    })
  );

  const renderSearchResults = (): React.ReactElement[] => {
    const allFiles = getAllFiles(fileTree, folderContents);
    const filtered = allFiles.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
      || item.path.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (filtered.length === 0) {
      return [
        <div key="no-results" className="text-center text-zinc-400 py-12">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-xs font-bold uppercase tracking-widest">No Matches Found</p>
        </div>,
      ];
    }

    return filtered.map((item) => (
      <button
        key={item.path}
        className="w-full flex items-center px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-left transition-colors group"
        onClick={() => item.type === 'file' && void onOpenFile(item.path)}
      >
        {item.type === 'dir' ? (
          <FolderOpen className="w-4 h-4 mr-3 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
        ) : (
          <FileCode className="w-4 h-4 mr-3 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{item.name}</div>
          <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-tight truncate">{item.path}</div>
        </div>
      </button>
    ));
  };

  return (
    <div className="h-full flex flex-col bg-zinc-50/50 dark:bg-zinc-950/50">
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Repository Explorer</h3>
          <button
            onClick={() => void onRefresh()}
            className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all active:scale-95"
            title="Refresh File Tree"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => setCompilationMode('repository')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                compilationMode === 'repository'
                  ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
              }`}
            >
              <Package className="w-3 h-3" />
              Repo
            </button>
            <button
              onClick={() => setCompilationMode('file')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                compilationMode === 'file'
                  ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
              }`}
            >
              <FileCode className="w-3 h-3" />
              File
            </button>
          </div>

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setAutoCompile(!autoCompile)}>
              <div className={`w-8 h-4 rounded-full transition-colors relative flex items-center ${autoCompile ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}>
                <div className={`w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${autoCompile ? 'translate-x-4' : 'translate-x-1'}`} />
              </div>
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">Auto-Compile</span>
            </div>
            {autoCompile && <Zap className="w-3 h-3 text-amber-500 animate-pulse" />}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-3">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-10 h-10 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Indexing Workspace...</p>
          </div>
        ) : (
          <div className="space-y-6 pb-20">
            {/* File Tree Section */}
            <section>
              <div className="flex items-center gap-2 mb-3 px-2">
                <Layout className="w-3 h-3 text-indigo-500" />
                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Workspace Root</span>
              </div>
              <div className="space-y-0.5">
                {fileTree.length > 0 ? (
                  renderFileTree(fileTree)
                ) : (
                  <div className="py-12 text-center bg-white/50 dark:bg-zinc-900/50 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                    <Package className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Empty Directory</p>
                  </div>
                )}
              </div>
            </section>

            {/* Recent Section */}
            {recentFiles.length > 0 && (
              <section className="animate-in fade-in duration-700 delay-200">
                <div className="flex items-center gap-2 mb-3 px-2">
                  <History className="w-3 h-3 text-zinc-400" />
                  <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Recents</span>
                </div>
                <div className="space-y-2">
                  {recentFiles.slice(0, 4).map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => void onOpenFile(entry.path)}
                      className="w-full p-3 rounded-xl bg-white border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-900 hover:shadow-md transition-all text-left group"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-indigo-600 transition-colors">{entry.name}</span>
                        <span className="text-[9px] font-bold text-zinc-400 group-hover:text-indigo-400">{new Date(entry.openedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="text-[9px] font-medium text-zinc-400 uppercase tracking-tight truncate">{entry.path}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Review Board Section */}
            <section className="animate-in fade-in duration-700 delay-300">
              <div className="flex items-center gap-2 mb-3 px-2">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Review Board</span>
              </div>

              <div className="space-y-4">
                {activeTab && (
                  <div className="p-4 rounded-2xl bg-white border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 shadow-sm ring-1 ring-zinc-900/5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center shrink-0">
                        <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black text-zinc-900 dark:text-zinc-100 truncate leading-tight uppercase tracking-wider">{activeTab.name}</p>
                        <p className="text-[9px] font-bold text-zinc-400 truncate uppercase tracking-tight mt-0.5 opacity-60">Selected for Markup</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-2 block">Quality Gate</label>
                        <select
                          value={reviewStatus}
                          onChange={(event) => setReviewStatus(event.target.value as ReviewMarkerStatus)}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-none text-[11px] font-bold text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <option value="needs-review">Needs Review</option>
                          <option value="verify-preview">Verify Preview</option>
                          <option value="ready">Ready to Publish</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-2 block">Instructor Notes</label>
                        <textarea
                          value={reviewNote}
                          onChange={(event) => setReviewNote(event.target.value)}
                          rows={3}
                          placeholder="Note down specific fixes or feedback..."
                          className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-none text-[11px] font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={onSaveReviewMarker}
                          className="flex-1 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-800 dark:hover:bg-white transition-all active:scale-95 shadow-lg shadow-zinc-200 dark:shadow-none"
                        >
                          Apply Marker
                        </button>
                        {reviewMarkers[activeTab.path] && (
                          <button
                            onClick={() => onClearReviewMarker(activeTab.path)}
                            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all active:scale-95"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {reviewEntries.length > 0 && (
                  <div className="space-y-2">
                    {reviewEntries.slice(0, 5).map((entry) => (
                      <button
                        key={entry.path}
                        onClick={() => void onOpenFile(entry.path)}
                        className="w-full p-3 rounded-xl bg-white border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all text-left"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 truncate flex-1 uppercase tracking-tight">{entry.path.split('/').pop()}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${getMarkerChipClassName(entry.status)}`}>
                            {getReviewMarkerLabel(entry.status)}
                          </span>
                        </div>
                        {entry.note && (
                          <div className="flex items-start gap-1.5 opacity-60">
                            <StickyNote className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                            <p className="line-clamp-2 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{entry.note}</p>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Global Search Section */}
            <section className="animate-in fade-in duration-700 delay-500">
              <div className="flex items-center gap-2 mb-3 px-2">
                <Search className="w-3 h-3 text-zinc-400" />
                <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em]">Global Index</span>
              </div>
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Search all files..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 outline-none transition-all shadow-sm"
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
