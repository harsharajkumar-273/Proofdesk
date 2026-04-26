import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronRight, FileCode, CheckCircle2 } from 'lucide-react';

export interface Diagnostic {
  filePath: string;
  fileName: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning';
  source: string;
}

interface EditorProblemsPaneProps {
  diagnostics: Diagnostic[];
  activeFilePath?: string | null;
  onNavigate: (path: string, line: number) => void | Promise<void>;
}

interface FileGroup {
  filePath: string;
  fileName: string;
  errors: Diagnostic[];
  warnings: Diagnostic[];
}

function buildFileGroups(diagnostics: Diagnostic[]): FileGroup[] {
  const map = new Map<string, FileGroup>();
  for (const d of diagnostics) {
    if (!map.has(d.filePath)) {
      map.set(d.filePath, { filePath: d.filePath, fileName: d.fileName, errors: [], warnings: [] });
    }
    const group = map.get(d.filePath)!;
    if (d.severity === 'error') group.errors.push(d);
    else group.warnings.push(d);
  }
  // Sort: files with errors first, then by file name
  return Array.from(map.values()).sort((a, b) => {
    if (a.errors.length !== b.errors.length) return b.errors.length - a.errors.length;
    return a.fileName.localeCompare(b.fileName);
  });
}

const EditorProblemsPane: React.FC<EditorProblemsPaneProps> = ({
  diagnostics,
  activeFilePath,
  onNavigate,
}) => {
  const groups = buildFileGroups(diagnostics);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const toggleFile = (filePath: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Problems
        </span>
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-3 h-3" />
              {errorCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {warningCount}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/50" />
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
              No problems in open files
            </p>
          </div>
        ) : (
          groups.map((group) => {
            const isCollapsed = collapsedFiles.has(group.filePath);
            const isActive = group.filePath === activeFilePath;
            const allIssues = [...group.errors, ...group.warnings].sort(
              (a, b) => a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn,
            );
            const issueCount = allIssues.length;

            return (
              <div key={group.filePath}>
                {/* File header row */}
                <button
                  onClick={() => toggleFile(group.filePath)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors ${
                    isActive ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''
                  }`}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3 flex-shrink-0 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-3 h-3 flex-shrink-0 text-zinc-400" />
                  )}
                  <FileCode className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-indigo-500' : 'text-zinc-400'}`} />
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate flex-1">
                    {group.fileName}
                  </span>
                  <span className="text-[10px] font-bold text-zinc-400 flex-shrink-0">
                    {issueCount}
                  </span>
                </button>

                {/* Issue rows */}
                {!isCollapsed && (
                  <ul>
                    {allIssues.map((d, idx) => (
                      <li key={idx}>
                        <button
                          onClick={() => void onNavigate(d.filePath, d.startLineNumber)}
                          className="w-full flex items-start gap-2 pl-8 pr-3 py-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
                          title={d.message}
                        >
                          {d.severity === 'error' ? (
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-rose-500" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
                          )}
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs text-zinc-700 dark:text-zinc-300 truncate group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                              {d.message}
                            </span>
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                              {d.fileName}:{d.startLineNumber}:{d.startColumn}
                              <span className="ml-1.5 text-zinc-300 dark:text-zinc-600">{d.source}</span>
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default EditorProblemsPane;
