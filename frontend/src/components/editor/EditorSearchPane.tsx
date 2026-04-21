import React, { useEffect, useRef, useState } from 'react';
import { File, Search } from 'lucide-react';

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

interface EditorSearchPaneProps {
  activeTabId: string | null;
  fileTree: FileNode[];
  folderContents: Record<string, FileNode[]>;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  tabs: TabLike[];
  onOpenFile: (path: string, line?: number) => void | Promise<void>;
  sessionId?: string | null;
  apiUrl?: string;
}

const DEBOUNCE_MS = 350;

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-500 text-gray-900 rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const EditorSearchPane: React.FC<EditorSearchPaneProps> = ({
  activeTabId,
  searchQuery,
  setSearchQuery,
  tabs,
  onOpenFile,
  sessionId,
  apiUrl = 'http://localhost:4000',
}) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = searchQuery.trim();

    if (!trimmed || !sessionId) {
      setResults([]);
      setTotalMatches(0);
      setError(null);
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
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
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery, sessionId, apiUrl]);

  const isEmpty = searchQuery.trim().length === 0;

  return (
    <div className="h-full flex flex-col">
      <div className="editor-sidebar-header p-3 border-b border-gray-700">
        <h3 className="font-medium text-gray-300">SEARCH</h3>
        <div className="mt-3 relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search file contents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        {!isEmpty && !loading && results.length > 0 && (
          <p className="text-xs text-gray-500 mt-1.5">
            {totalMatches} match{totalMatches !== 1 ? 'es' : ''} in {results.length} file{results.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="text-center text-gray-500 py-8 px-3">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Search across all repository files</p>
            <p className="text-xs mt-1 opacity-60">.xml · .ptx · .html · .css · .js and more</p>
          </div>
        ) : loading ? (
          <div className="text-center text-gray-500 py-8">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50 animate-pulse" />
            <p className="text-sm">Searching…</p>
          </div>
        ) : error ? (
          <div className="text-center text-red-400 py-8 px-3">
            <p className="text-sm">{error}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center text-gray-500 py-8 px-3">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No results for &ldquo;{searchQuery}&rdquo;</p>
          </div>
        ) : (
          results.map((result) => (
            <div key={result.path} className="border-b border-gray-800">
              <button
                className={`w-full flex items-center px-3 py-2 hover:bg-gray-700 text-left ${
                  tabs.find((t) => t.path === result.path && t.id === activeTabId)
                    ? 'bg-gray-700'
                    : ''
                }`}
                onClick={() => void onOpenFile(result.path)}
              >
                <File className="w-4 h-4 mr-2 text-blue-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate text-gray-200 font-medium">
                    {result.path.split('/').pop()}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{result.path}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <span className="text-xs bg-blue-800 text-blue-200 rounded px-1">
                    {result.matches.length}
                  </span>
                  {tabs.find((t) => t.path === result.path && t.hasUnsavedChanges) && (
                    <span className="text-orange-400">●</span>
                  )}
                </div>
              </button>
              {result.matches.map((match) => (
                <button
                  key={`${result.path}:${match.line}`}
                  className="w-full flex items-start px-3 py-1 hover:bg-gray-800 text-left pl-9"
                  onClick={() => void onOpenFile(result.path, match.line)}
                >
                  <span className="text-xs text-gray-600 w-8 shrink-0 text-right mr-2 mt-0.5 font-mono">
                    {match.line}
                  </span>
                  <span className="text-xs text-gray-400 font-mono leading-relaxed break-all">
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
