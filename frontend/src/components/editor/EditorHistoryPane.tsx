import React, { useEffect, useState, useCallback } from 'react';
import { 
  History, GitCommit, Calendar, User, 
  FileCode, ArrowLeftRight,
  Undo2, Loader2, X, AlertTriangle
} from 'lucide-react';
import { requestJson } from '../../utils/editorApi';

interface CommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
  files: string[];
}

interface EditorHistoryPaneProps {
  sessionId: string | null;
  apiUrl: string;
  onRollbackSuccess: (filePath: string) => void | Promise<void>;
}

export const EditorHistoryPane: React.FC<EditorHistoryPaneProps> = ({
  sessionId,
  apiUrl,
  onRollbackSuccess,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // UI States
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [selectedFileDiff, setSelectedFileDiff] = useState<{ commitSha: string; file: string } | null>(null);
  const [diffContent, setDiffContent] = useState<string>('');
  const [diffLoading, setDiffLoading] = useState<boolean>(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  
  const [rollingBackFile, setRollingBackFile] = useState<string | null>(null);

  const fetchCommits = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await requestJson<{ success: boolean; commits: CommitInfo[] }>(
        `${apiUrl}/workspace/${sessionId}/git/commits`,
        {},
        'Failed to fetch workspace commit history'
      );
      if (data.success) {
        setCommits(data.commits || []);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Error loading revision history.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, apiUrl]);

  useEffect(() => {
    void fetchCommits();
  }, [fetchCommits]);

  const toggleCommit = (hash: string) => {
    setExpandedCommit(prev => (prev === hash ? null : hash));
  };

  const loadDiff = async (commitSha: string, file: string) => {
    setSelectedFileDiff({ commitSha, file });
    setDiffLoading(true);
    setDiffError(null);
    setDiffContent('');

    try {
      const data = await requestJson<{ success: boolean; diff: string }>(
        `${apiUrl}/workspace/${sessionId}/git/commits/${commitSha}/diff?path=${encodeURIComponent(file)}`,
        {},
        `Failed to fetch diff for ${file}`
      );
      if (data.success) {
        setDiffContent(data.diff || '');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiffError(msg || 'Could not load diff.');
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRollback = async (commitSha: string, file: string) => {
    const confirmed = window.confirm(`Are you sure you want to roll back "${file}" to commit ${commitSha.slice(0, 7)}? Unsaved local changes on this file will be lost.`);
    if (!confirmed) return;

    setRollingBackFile(file);
    try {
      const data = await requestJson<{ success: boolean; status: unknown }>(
        `${apiUrl}/workspace/${sessionId}/git/commits/${commitSha}/rollback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: file }),
        },
        'Rollback failed'
      );

      if (data.success) {
        // Close modal
        setSelectedFileDiff(null);
        // Call callback to notify parent editor to update model
        await onRollbackSuccess(file);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Rollback failed: ${msg}`);
    } finally {
      setRollingBackFile(null);
    }
  };

  // Render a parsed git unified diff line-by-line with simple coloration
  const renderDiffLines = (rawDiff: string) => {
    if (!rawDiff.trim()) {
      return (
        <div className="p-4 text-center text-xs text-zinc-400 italic">
          No changes or binary file.
        </div>
      );
    }

    const lines = rawDiff.split('\n');
    return (
      <pre className="font-mono text-xs overflow-x-auto p-4 bg-zinc-950 text-zinc-300 leading-normal select-text">
        {lines.map((line, idx) => {
          let lineClass = 'text-zinc-400'; // metadata header lines
          if (line.startsWith('+') && !line.startsWith('+++')) {
            lineClass = 'bg-emerald-950/45 text-emerald-400 border-l-2 border-emerald-500 pl-1';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineClass = 'bg-rose-950/45 text-rose-400 border-l-2 border-rose-505 pl-1';
          } else if (line.startsWith('@@')) {
            lineClass = 'text-indigo-400 font-semibold bg-indigo-950/20';
          } else if (line.startsWith(' ') || !line.trim()) {
            lineClass = 'text-zinc-300 pl-1.5';
          }
          return (
            <div key={idx} className={`${lineClass} whitespace-pre`}>
              {line}
            </div>
          );
        })}
      </pre>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full py-8 text-center bg-white dark:bg-zinc-900">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Loading commit timeline...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-4 text-center bg-white dark:bg-zinc-900 gap-2">
        <AlertTriangle className="w-8 h-8 text-rose-500" />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{error}</span>
        <button 
          onClick={() => void fetchCommits()} 
          className="mt-2 text-xs font-bold text-indigo-500 hover:text-indigo-400"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 bg-zinc-50/50 dark:bg-zinc-800/10">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Revision History
          </span>
        </div>
      </div>

      {/* Commit List Timeline */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {commits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center text-zinc-400 dark:text-zinc-500 py-8">
            <GitCommit className="w-8 h-8 opacity-40" />
            <p className="text-xs italic">No revisions found.</p>
          </div>
        ) : (
          commits.map((commit) => {
            const isExpanded = expandedCommit === commit.hash;
            return (
              <div 
                key={commit.hash} 
                className={`border rounded-xl transition-all duration-200 ${
                  isExpanded 
                    ? 'border-indigo-200 bg-indigo-50/10 dark:border-indigo-900/50 dark:bg-indigo-950/5' 
                    : 'border-zinc-250 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-750'
                }`}
              >
                {/* Commit info header row */}
                <button
                  onClick={() => toggleCommit(commit.hash)}
                  className="w-full text-left p-3 flex flex-col gap-1.5 focus:outline-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-250 leading-snug line-clamp-2">
                      {commit.subject}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded flex-shrink-0">
                      {commit.shortHash}
                    </span>
                  </div>

                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {commit.author}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {commit.date}
                    </span>
                    {commit.files && commit.files.length > 0 && (
                      <span className="ml-auto text-indigo-500 dark:text-indigo-400 font-bold">
                        {commit.files.length} {commit.files.length === 1 ? 'file' : 'files'}
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded file list */}
                {isExpanded && (
                  <div className="border-t border-zinc-150 dark:border-zinc-850 p-2 bg-zinc-50/40 dark:bg-zinc-900/40 rounded-b-xl">
                    {commit.files.length === 0 ? (
                      <p className="text-[10px] text-zinc-400 italic p-2">No modified files in this commit.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {commit.files.map((file) => (
                          <div 
                            key={file} 
                            className="flex items-center justify-between p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileCode className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-355 truncate" title={file}>
                                {file.split('/').pop()}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <button
                                onClick={() => void loadDiff(commit.hash, file)}
                                className="px-2 py-0.5 text-[10px] font-bold text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/35 rounded-md transition-all flex items-center gap-1"
                                title="Inspect Changes"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                                Diff
                              </button>
                              <button
                                onClick={() => void handleRollback(commit.hash, file)}
                                className="px-2 py-0.5 text-[10px] font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/35 rounded-md transition-all flex items-center gap-1"
                                title="Restore file to this state"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                Restore
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Diff Inspector Modal (Portal overlay style) */}
      {selectedFileDiff && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-4xl max-h-[85vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/10 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-indigo-500" />
                  Diff: {selectedFileDiff.file.split('/').pop()}
                </h3>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono mt-0.5">
                  Commit {selectedFileDiff.commitSha.slice(0, 8)}
                </p>
              </div>
              <button
                onClick={() => setSelectedFileDiff(null)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content / Diff Viewer */}
            <div className="flex-1 overflow-auto bg-zinc-950 min-h-[250px]">
              {diffLoading ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[250px]">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                  <span className="text-xs text-zinc-400">Loading code differences...</span>
                </div>
              ) : diffError ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[250px] text-center p-4 gap-2">
                  <AlertTriangle className="w-8 h-8 text-rose-500" />
                  <span className="text-xs text-zinc-400">{diffError}</span>
                </div>
              ) : (
                renderDiffLines(diffContent)
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/10 flex items-center justify-between flex-shrink-0">
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                Double check the diff before restoring to prevent accidental overwrite.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedFileDiff(null)}
                  className="px-4 py-2 border border-zinc-250 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-300 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => void handleRollback(selectedFileDiff.commitSha, selectedFileDiff.file)}
                  disabled={rollingBackFile !== null}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                >
                  {rollingBackFile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-4 h-4" />
                      Restore This Version
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
