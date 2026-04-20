import React from 'react';
import { FileCode, X, MoreHorizontal, MousePointer2 } from 'lucide-react';

interface TabLike {
  id: string;
  name: string;
  hasUnsavedChanges: boolean;
}

interface EditorTabBarProps {
  tabs: TabLike[];
  activeTabId: string | null;
  setActiveTabId: (id: string) => void;
  closeTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
}

const EditorTabBar: React.FC<EditorTabBarProps> = ({
  tabs,
  activeTabId,
  setActiveTabId,
  closeTab,
  closeOtherTabs,
  closeAllTabs,
}) => (
  <div className="h-10 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-1 flex-shrink-0 z-30">
    <div className="flex-1 flex items-center gap-0.5 overflow-x-auto no-scrollbar scroll-smooth h-full pt-1">
      {tabs.length > 0 ? (
        tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          return (
            <div
              key={tab.id}
              className={`group relative flex items-center gap-2 px-3 h-full min-w-[120px] max-w-[240px] text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all border-x border-transparent ${
                isActive
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 border-x-zinc-200 dark:border-x-zinc-800 rounded-t-lg shadow-[0_-2px_0_inset_#6366f1]'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900/50'
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <FileCode className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-500' : 'text-zinc-400 opacity-60'}`} />
              <span className="truncate flex-1">{tab.name}</span>
              
              <div className="flex items-center gap-1">
                {tab.hasUnsavedChanges && (
                  <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-indigo-500' : 'bg-amber-500'}`} />
                )}
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className={`p-1 rounded-md transition-all ${
                    isActive 
                    ? 'hover:bg-zinc-100 dark:hover:bg-zinc-800 opacity-100' 
                    : 'opacity-0 group-hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })
      ) : (
        <div className="flex items-center gap-2 px-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest italic opacity-60">
          <MousePointer2 className="w-3 h-3" />
          <span>No Workspace Files Active</span>
        </div>
      )}
    </div>

    {tabs.length > 0 && (
      <div className="flex items-center gap-1 px-2 border-l border-zinc-200 dark:border-zinc-800 h-full">
        <div className="group relative">
          <button className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
          
          <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl overflow-hidden opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all animate-in fade-in zoom-in-95 duration-150 origin-top-right z-50">
            <div className="p-1">
              <button
                onClick={() => {
                  if (activeTabId) closeOtherTabs(activeTabId);
                }}
                className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider rounded-md transition-colors"
              >
                Close Others
              </button>
              <button
                onClick={closeAllTabs}
                className="w-full text-left px-3 py-2 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider rounded-md transition-colors"
              >
                Close All Tabs
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);

export default EditorTabBar;
