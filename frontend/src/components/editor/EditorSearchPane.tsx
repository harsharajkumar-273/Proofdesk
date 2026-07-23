import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  File,
  Search,
  Replace,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

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

interface SearchMatch {
  line: number;
  text: string;
}

interface SearchResult {
  path: string;
  matches: SearchMatch[];
}

export interface EditorSearchPaneProps {
  activeTabId: string | null;
  fileTree?: FileNode[];
  folderContents?: Record<string, FileNode[]>;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  tabs: TabLike[];
  onOpenFile: (path: string, line?: number) => void | Promise<void>;
  sessionId?: string | null;
  apiUrl?: string;
  onRefreshWorkspace?: () => void | Promise<void>;
}

const DEBOUNCE_MS = 350;

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-500 text-gray-900 rounded-sm px-0.5 font-semibold">
        {text.slice(0 + idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export const EditorSearchPane: React.FC<EditorSearchPaneProps> = ({
  activeTabId,
  searchQuery,
  setSearchQuery,
  tabs,
  onOpenFile,
  sessionId,
  apiUrl = 'http://localhost:4000',
  onRefreshWorkspace,
}) => {
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [showReplace, setShowReplace] = useState<boolean>(true);
  const [matchCase, setMatchCase] = useState<boolean>(false);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [replacing, setReplacing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [totalMatches, setTotalMatches] = useState<number>(0);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const performSearch = useCallback(
    async (queryToSearch: string) => {
      const trimmed = queryToSearch.trim();
      if (!trimmed || !sessionId) {
        setResults([]);
        setTotalMatches(0);
        setError(null);
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${apiUrl}/workspace/${encodeURIComponent(sessionId)}/search?q=${encodeURIComponent(trimmed)}`,
          { credentials: 'include', signal: controller.signal }
        );

        if (!response.ok) throw new Error(`Search failed (${response.status})`);

        const data: { results: SearchResult[] } = await response.json();
        const list = data.results ?? [];
        setResults(list);
        setTotalMatches(list.reduce((sum, r) => sum + r.matches.length, 0));
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [sessionId, apiUrl]
  );

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!searchQuery.trim()) {
      setResults([]);
      setTotalMatches(0);
      setError(null);
      return;
    }

    debounceTimer.current = setTimeout(() => {
      void performSearch(searchQuery);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery, performSearch]);

  const handleReplace = async (targetPath?: string) => {
    if (!sessionId || !searchQuery.trim()) return;

    setReplacing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        `${apiUrl}/workspace/${encodeURIComponent(sessionId)}/replace`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            query: searchQuery.trim(),
            replacement: replaceQuery,
            paths: targetPath ? [targetPath] : undefined,
            matchCase,
          }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Replace failed (${response.status})`);
      }

      const data: {
        success: boolean;
        filesModified: number;
        totalReplacements: number;
        modifiedFiles: string[];
      } = await response.json();

      setSuccessMessage(
        `Replaced ${data.totalReplacements} occurrence${data.totalReplacements !== 1 ? 's' : ''} across ${data.filesModified} file${data.filesModified !== 1 ? 's' : ''}.`
      );

      // Re-run search to update results view
      await performSearch(searchQuery);

      if (onRefreshWorkspace) {
        await onRefreshWorkspace();
      }
    } catch (err: any) {
      setError(err.message || 'Replace operation failed');
    } finally {
      setReplacing(false);
    }
  };

  const isEmpty = searchQuery.trim().length === 0;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 select-none">
      {/* Search Header Container */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setShowReplace(!showReplace)}>
            {showReplace ? (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-500" />
            )}
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
              SEARCH & REPLACE
            </h3>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setMatchCase(!matchCase)}
              className={`px-1.5 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                matchCase
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200'
              }`}
              title="Match Case (Aa)"
            >
              Aa
            </button>
            <button
              onClick={() => void performSearch(searchQuery)}
              disabled={loading || isEmpty}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-40"
              title="Refresh Search Results"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search Field */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search across all files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Replace Field */}
        {showReplace && (
          <div className="space-y-2 pt-0.5">
            <div className="relative flex items-center">
              <Replace className="w-3.5 h-3.5 absolute left-2.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Replace with..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-md focus:outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
              />
              {replaceQuery && (
                <button
                  onClick={() => setReplaceQuery('')}
                  className="absolute right-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => void handleReplace()}
                disabled={isEmpty || replacing || totalMatches === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Replace all occurrences across all files"
              >
                <Replace className="w-3.5 h-3.5" />
                <span>{replacing ? 'Replacing...' : 'Replace All'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Feedback messages */}
        {successMessage && (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-[11px]">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 text-xs bg-rose-50 dark:bg-rose-950/40 p-2 rounded border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-[11px]">{error}</span>
          </div>
        )}

        {!isEmpty && !loading && results.length > 0 && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium pt-0.5">
            {totalMatches} match{totalMatches !== 1 ? 'es' : ''} in {results.length} file
            {results.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="text-center text-zinc-400 dark:text-zinc-500 py-10 px-4 space-y-2">
            <Search className="w-8 h-8 mx-auto opacity-50 stroke-1" />
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Workspace-Wide Search & Replace
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              Search across .xml, .ptx, .html, .css, and .js repository files.
            </p>
          </div>
        ) : loading ? (
          <div className="text-center text-zinc-400 dark:text-zinc-500 py-10 space-y-2">
            <Search className="w-8 h-8 mx-auto opacity-50 animate-pulse stroke-1" />
            <p className="text-xs">Searching workspace files…</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center text-zinc-400 dark:text-zinc-500 py-10 px-4 space-y-2">
            <Search className="w-8 h-8 mx-auto opacity-50 stroke-1" />
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              No matches found for &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        ) : (
          results.map((result) => (
            <div key={result.path} className="border-b border-zinc-100 dark:border-zinc-800">
              <div
                className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors ${
                  tabs.find((t) => t.path === result.path && t.id === activeTabId)
                    ? 'bg-indigo-50/50 dark:bg-indigo-950/30'
                    : ''
                }`}
              >
                <button
                  className="flex items-center min-w-0 flex-1 text-left mr-2"
                  onClick={() => void onOpenFile(result.path)}
                >
                  <File className="w-3.5 h-3.5 mr-2 text-indigo-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs truncate text-zinc-900 dark:text-zinc-100 font-medium">
                      {result.path.split('/').pop()}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">{result.path}</div>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded px-1.5 py-0.5 border border-indigo-200 dark:border-indigo-800">
                    {result.matches.length}
                  </span>

                  {showReplace && (
                    <button
                      onClick={() => void handleReplace(result.path)}
                      disabled={replacing}
                      className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-950 text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                      title={`Replace occurrences in ${result.path.split('/').pop()}`}
                    >
                      <Replace className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {result.matches.map((match) => (
                <button
                  key={`${result.path}:${match.line}`}
                  className="w-full flex items-start px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-left pl-8 transition-colors group"
                  onClick={() => void onOpenFile(result.path, match.line)}
                >
                  <span className="text-[10px] text-zinc-400 w-6 shrink-0 text-right mr-2 mt-0.5 font-mono group-hover:text-indigo-500">
                    L{match.line}
                  </span>
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 font-mono leading-relaxed break-all">
                    {highlight(match.text.trim(), searchQuery.trim())}
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EditorSearchPane;
