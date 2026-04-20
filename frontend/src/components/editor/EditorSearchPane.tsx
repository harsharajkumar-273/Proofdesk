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
  onOpenFile: (path: string) => void | Promise<void>;
  sessionId?: string | null;
  apiUrl?: string;
}

const DEBOUNCE_MS = 350;

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
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = searchQuery.trim();

    if (!trimmed || !sessionId) {
      setResults([]);
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

        if (!response.ok) {
          throw new Error(`Search failed (${response.status})`);
        }

        const data: SearchResult[] = await response.json();
        setResults(data);
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
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-gray-900 border border-gray-700 rounded text-sm text-white"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="text-center text-gray-500 py-8">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Search file contents</p>
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
          <div className="text-center text-gray-500 py-8">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No results for &ldquo;{searchQuery}&rdquo;</p>
          </div>
        ) : (
          results.map((result) => (
            <div key={result.path} className="border-b border-gray-800">
              <button
                className={`w-full flex items-center px-3 py-2 hover:bg-gray-700 text-left ${
                  tabs.find((tab) => tab.path === result.path && tab.id === activeTabId)
                    ? 'bg-gray-700'
                    : ''
                }`}
                onClick={() => void onOpenFile(result.path)}
              >
                <File className="w-4 h-4 mr-2 text-blue-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate text-gray-200">
                    {result.path.split('/').pop()}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{result.path}</div>
                </div>
                {tabs.find((tab) => tab.path === result.path && tab.hasUnsavedChanges) && (
                  <span className="ml-1 text-orange-400 shrink-0">●</span>
                )}
              </button>
              {result.matches.map((match) => (
                <button
                  key={`${result.path}:${match.line}`}
                  className="w-full flex items-start px-3 py-1 hover:bg-gray-750 text-left pl-9 bg-gray-900"
                  onClick={() => void onOpenFile(result.path)}
                >
                  <span className="text-xs text-gray-600 w-8 shrink-0 text-right mr-2">
                    {match.line}
                  </span>
                  <span className="text-xs text-gray-400 truncate font-mono">{match.text}</span>
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
