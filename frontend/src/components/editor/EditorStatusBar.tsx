import React from 'react';
import { User, CheckCircle2, AlertCircle, Cpu, Zap, Files } from 'lucide-react';

interface EditorStatusBarProps {
  compilationMode: 'repository' | 'file';
  autoCompile: boolean;
  repoCompilationResult: { success: boolean } | null;
  openTabsCount: number;
  unsavedCount: number;
  userLogin?: string;
}

const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  compilationMode,
  autoCompile,
  repoCompilationResult,
  openTabsCount,
  unsavedCount,
  userLogin,
}) => (
  <footer className="editor-statusbar h-7 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 overflow-x-auto px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 flex-shrink-0 z-40">
    <div className="flex flex-shrink-0 items-center gap-3 sm:gap-5">
      <div className="flex items-center gap-1.5">
        <Cpu className="w-3 h-3 text-zinc-400" />
        <span className="hidden text-zinc-400 sm:inline">Mode</span>
        <span className="text-zinc-900 dark:text-zinc-300">{compilationMode === 'repository' ? 'Repository Build' : 'Single File'}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Zap className={`w-3 h-3 ${autoCompile ? 'text-amber-500' : 'text-zinc-400'}`} />
        <span className="hidden text-zinc-400 sm:inline">Auto-Compile</span>
        <span className={autoCompile ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400'}>
          {autoCompile ? 'Active' : 'Disabled'}
        </span>
      </div>

      {repoCompilationResult && (
        <div className="flex items-center gap-1.5">
          {repoCompilationResult.success ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          ) : (
            <AlertCircle className="w-3 h-3 text-rose-500" />
          )}
          <span className="hidden text-zinc-400 sm:inline">Last Build</span>
          <span className={repoCompilationResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
            {repoCompilationResult.success ? 'Success' : 'Failed'}
          </span>
        </div>
      )}
    </div>

    <div className="flex flex-shrink-0 items-center gap-3 sm:gap-5">
      <div className="flex items-center gap-1.5">
        <Files className="w-3 h-3 text-zinc-400" />
        <span className="hidden text-zinc-400 sm:inline">Open Tabs</span>
        <span className="text-zinc-900 dark:text-zinc-300">{openTabsCount}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${unsavedCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
        <span className="hidden text-zinc-400 sm:inline">Unsaved Changes</span>
        <span className={unsavedCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-300'}>
          {unsavedCount}
        </span>
      </div>

      {userLogin && (
        <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-200 dark:border-zinc-800">
          <User className="w-3 h-3 text-indigo-500" />
          <span className="text-zinc-900 dark:text-zinc-300 lowercase">{userLogin}</span>
        </div>
      )}
    </div>
  </footer>
);

export default EditorStatusBar;
