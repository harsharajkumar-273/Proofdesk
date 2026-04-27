import React from 'react';
import { FolderTree, Plus, X } from 'lucide-react';

export interface RepoTabEntry {
  repoKey: string;
  fullName: string;
  hasUnsaved: boolean;
}

interface EditorRepoTabBarProps {
  repos: RepoTabEntry[];
  activeRepoKey: string | null;
  onSwitch: (repoKey: string) => void;
  onClose: (repoKey: string) => void;
  onOpenNew: () => void;
}

const EditorRepoTabBar: React.FC<EditorRepoTabBarProps> = ({
  repos,
  activeRepoKey,
  onSwitch,
  onClose,
  onOpenNew,
}) => (
  <div className="flex items-center h-7 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto flex-shrink-0">
    {repos.map((entry) => {
      const isActive = entry.repoKey === activeRepoKey;
      const shortName = entry.fullName.split('/').pop() ?? entry.fullName;
      return (
        <div
          key={entry.repoKey}
          onClick={() => !isActive && onSwitch(entry.repoKey)}
          className={`group flex items-center gap-1.5 px-3 h-full border-r border-zinc-200 dark:border-zinc-800 flex-shrink-0 min-w-0 max-w-[200px] select-none transition-colors ${
            isActive
              ? 'bg-white dark:bg-zinc-950 cursor-default'
              : 'cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800'
          }`}
        >
          <FolderTree
            className={`w-3 h-3 flex-shrink-0 ${isActive ? 'text-indigo-500' : 'text-zinc-400'}`}
          />
          <span
            className={`text-[11px] font-medium truncate ${isActive ? 'text-zinc-900 dark:text-zinc-100' : ''}`}
            title={entry.fullName}
          >
            {shortName}
          </span>
          {entry.hasUnsaved && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(entry.repoKey);
            }}
            className="ml-auto flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
            title="Close repository"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      );
    })}
    <button
      onClick={onOpenNew}
      className="flex-shrink-0 px-2 h-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
      title="Open another repository"
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
  </div>
);

export default EditorRepoTabBar;
