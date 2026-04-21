import React from 'react';
import {
  ArrowLeft,
  ChevronDown,
  FolderTree,
  LogOut,
  Play,
  RefreshCw,
  Save,
  Terminal as TerminalIcon,
  User,
  Zap,
  Users,
  Search,
} from 'lucide-react';

interface RepositoryLike {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

interface UserDataLike {
  login: string;
  name?: string;
  avatar_url?: string;
  email?: string;
}

export interface RepositorySearchResult {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch?: string;
}

interface EditorTopBarProps {
  repo: RepositoryLike | null;
  userRepos: RepositorySearchResult[];
  userData: UserDataLike | null;
  showRepoSwitcher: boolean;
  setShowRepoSwitcher: (value: boolean) => void;
  fetchUserRepos: () => void;
  switchRepository: (repo: RepositorySearchResult) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
  openSaveReview: () => void;
  saving: boolean;
  unsavedCount: number;
  compileRepository: () => void;
  compiling: boolean;
  liveEditMode: boolean;
  setLiveEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  setLiveEditStatus: (value: string) => void;
  isRebuilding: boolean;
  collaborationEnabled: boolean;
  switchToSoloMode: () => void;
  switchToTeamMode: () => void;
  teamSessionBusy: boolean;
  teamSession: { code?: string } | null;
  copyTeamInviteCode: () => Promise<void>;
  createTeamSession: () => Promise<void>;
  teamSessionNotice: string;
  terminalOpen: boolean;
  setTerminalOpen: (value: boolean) => void;
  profileDropdownOpen: boolean;
  setProfileDropdownOpen: (value: boolean) => void;
  onLogout: () => void;
  navigateToRepoInput: () => void;
}

const EditorTopBar: React.FC<EditorTopBarProps> = ({
  repo,
  userRepos,
  userData,
  showRepoSwitcher,
  setShowRepoSwitcher,
  fetchUserRepos,
  switchRepository,
  openSaveReview,
  saving,
  unsavedCount,
  compileRepository,
  compiling,
  liveEditMode,
  setLiveEditMode,
  setLiveEditStatus,
  isRebuilding,
  collaborationEnabled,
  switchToSoloMode,
  switchToTeamMode,
  teamSessionBusy,
  teamSession,
  copyTeamInviteCode,
  terminalOpen,
  setTerminalOpen,
  profileDropdownOpen,
  setProfileDropdownOpen,
  onLogout,
  navigateToRepoInput,
}) => (
  <header className="glass-header z-40 flex min-h-14 flex-wrap items-center justify-between gap-2 px-2 py-2 sm:h-14 sm:flex-nowrap sm:px-4 sm:py-0">
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
      <button
        onClick={navigateToRepoInput}
        className="flex-shrink-0 p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all active:scale-95"
        title="Back to Dashboard"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      
      <div className="hidden h-6 w-px bg-zinc-200 mx-1 sm:block" />

      <div className="relative min-w-0 group">
        <button
          onClick={() => {
            setShowRepoSwitcher(!showRepoSwitcher);
            if (!showRepoSwitcher) fetchUserRepos();
          }}
          className="flex min-w-0 items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-sm font-semibold text-zinc-900 transition-all active:scale-[0.98]"
        >
          <FolderTree className="w-4 h-4 text-indigo-600" />
          <span className="max-w-[170px] truncate sm:max-w-[200px]">{repo ? repo.fullName : 'Select Repository'}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${showRepoSwitcher ? 'rotate-180' : ''}`} />
        </button>

        {showRepoSwitcher && (
          <div className="absolute top-full left-0 mt-2 w-[min(20rem,calc(100vw-1rem))] bg-white border border-zinc-200 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-left">
            <div className="p-3 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-zinc-200 rounded-lg shadow-sm">
                <Search className="w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Filter repositories..."
                  className="flex-1 bg-transparent text-xs outline-none text-zinc-900"
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {userRepos.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <p className="text-xs text-zinc-400 italic">No repositories found</p>
                </div>
              ) : (
                userRepos.map((repoItem) => (
                  <button
                    key={repoItem.id}
                    onClick={() => switchRepository(repoItem)}
                    className="w-full text-left px-3 py-2 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg text-xs font-medium text-zinc-600 flex items-center transition-colors group/item"
                  >
                    <FolderTree className="w-3.5 h-3.5 mr-2 text-zinc-300 group-hover/item:text-indigo-400" />
                    <span className="truncate">{repoItem.full_name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>

    <div className="editor-topbar-actions flex w-full min-w-0 items-center justify-start gap-1 overflow-x-auto pb-1 sm:w-auto sm:flex-none sm:justify-end sm:gap-2 sm:overflow-visible sm:pb-0">
      <div className="mr-1 flex flex-shrink-0 items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200 sm:mr-2">
        <button
          onClick={switchToSoloMode}
          className={`px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all sm:px-3 ${
            !collaborationEnabled
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'
          }`}
        >
          Solo
        </button>
        <button
          data-testid="team-mode-toggle"
          onClick={switchToTeamMode}
          className={`px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 sm:px-3 ${
            collaborationEnabled
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'
          }`}
        >
          <Users className="w-3 h-3" />
          <span>{teamSessionBusy && collaborationEnabled ? 'Syncing…' : 'Team'}</span>
        </button>
      </div>

      {collaborationEnabled && teamSession?.code && (
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            aria-label={`Code ${teamSession.code}`}
            onClick={() => void copyTeamInviteCode()}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors tracking-widest"
            title="Click to copy invite code"
          >
            Code {teamSession.code}
          </button>
        </div>
      )}

      <div className="h-6 w-px flex-shrink-0 bg-zinc-200 mx-1" />

      <button
        onClick={openSaveReview}
        disabled={saving || unsavedCount === 0}
        className="btn-primary h-9 flex-shrink-0 px-3 py-1.5 !bg-zinc-900 hover:!bg-zinc-800 sm:px-4"
      >
        <Save className="w-3.5 h-3.5" />
        <span className="hidden text-xs font-bold sm:inline">Save All {unsavedCount > 0 && `(${unsavedCount})`}</span>
      </button>

      <button
        data-testid="build-repository-button"
        onClick={compileRepository}
        disabled={compiling}
        className="btn-primary h-9 flex-shrink-0 px-3 py-1.5 sm:px-4"
      >
        {compiling ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
        <span className="hidden text-xs font-bold md:inline">{compiling ? 'Building' : 'Build Preview'}</span>
      </button>

      <button
        data-testid="live-edit-toggle"
        onClick={() => {
          setLiveEditMode((value) => !value);
          setLiveEditStatus('');
        }}
        className={`h-9 flex-shrink-0 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
          liveEditMode
            ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm'
            : 'bg-white text-zinc-500 border border-zinc-200 hover:border-zinc-300'
        }`}
        title="Live Sync — auto-builds on change"
      >
        <Zap className={`w-3.5 h-3.5 ${liveEditMode ? 'fill-indigo-500 text-indigo-500' : ''} ${liveEditMode && isRebuilding ? 'animate-pulse' : ''}`} />
        <span className="hidden md:inline">{liveEditMode ? 'Live Sync' : 'Static'}</span>
      </button>

      <div className="h-6 w-px flex-shrink-0 bg-zinc-200 mx-1" />

      <button
        onClick={() => setTerminalOpen(!terminalOpen)}
        className={`flex-shrink-0 p-2 rounded-lg transition-all ${terminalOpen ? 'bg-indigo-50 text-indigo-600' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}
        title="Toggle Integrated Terminal"
      >
        <TerminalIcon className="w-4 h-4" />
      </button>

      <div className="relative flex-shrink-0">
        <button
          onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
          className="flex items-center gap-1 p-0.5 pr-1.5 bg-zinc-100 rounded-full border border-zinc-200 hover:bg-zinc-200 transition-all active:scale-95"
        >
          {userData?.avatar_url ? (
            <img
              src={userData.avatar_url}
              alt={userData.login}
              className="w-7 h-7 rounded-full shadow-sm"
            />
          ) : (
            <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-600" />
            </div>
          )}
          <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${profileDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {profileDropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-zinc-200 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
            <div className="p-4 border-b border-zinc-100 bg-zinc-50/50">
              <div className="font-bold text-zinc-900 text-sm">{userData?.name || userData?.login}</div>
              <div className="text-[10px] text-zinc-500 font-medium truncate uppercase tracking-wider mt-0.5">{userData?.email || 'Authenticated Author'}</div>
            </div>
            <div className="p-1">
              <button
                onClick={onLogout}
                className="w-full text-left px-3 py-2 hover:bg-rose-50 hover:text-rose-600 rounded-lg text-xs font-bold text-zinc-600 flex items-center transition-colors group/logout"
              >
                <LogOut className="w-3.5 h-3.5 mr-2 text-zinc-400 group-hover/logout:text-rose-400" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </header>
);

export default EditorTopBar;
