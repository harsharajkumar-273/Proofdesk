import React, { useCallback, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  FolderOpen,
  Layers3,
  Link as LinkIcon,
  Search,
  Star,
  Users,
  Github,
  Plus,
  BookOpenText,
} from 'lucide-react';
import { getLocalTestRepository, isLocalTestModeEnabled } from '../utils/localTestMode';
import { extractRepoFromLink, normalizeTeamCode } from '../utils/repositoryInput';
import { PRODUCT_NAME } from '../utils/brand';

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  owner?: { login: string };
  default_branch?: string;
  stargazers_count?: number;
  language?: string;
}

interface SelectedRepository {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

interface ParsedRepositorySelection {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch?: string;
}

const normalizeRepositorySelection = (repo: Repository | ParsedRepositorySelection): SelectedRepository => {
  if ('full_name' in repo) {
    return {
      owner: repo.owner?.login || repo.full_name.split('/')[0] || 'unknown',
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch || 'main',
    };
  }

  return {
    owner: repo.owner,
    name: repo.name,
    fullName: repo.fullName,
    defaultBranch: repo.defaultBranch || 'main',
  };
};

const RepoInputPage: React.FC = () => {
  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  const [inputMode, setInputMode] = useState<'search' | 'link'>('search');
  const [searchQuery, setSearchQuery] = useState("");
  const [repoLink, setRepoLink] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [searchResults, setSearchResults] = useState<Repository[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isJoiningTeam, setIsJoiningTeam] = useState(false);
  const [error, setError] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const localTestMode = isLocalTestModeEnabled();
  const localDemoRepo = getLocalTestRepository();

  const redirectToLanding = useCallback((reason?: string) => {
    if (reason) {
      navigate(`/?error=${encodeURIComponent(reason)}`);
      return;
    }

    navigate('/');
  }, [navigate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search repositories
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // Don't search if we've already selected a repo and the query matches it
    if (selectedRepo && searchQuery === selectedRepo.full_name) {
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setError("");
      setShowDropdown(true);

      try {
        const response = await fetch(
          `${API_URL}/repos/search?q=${encodeURIComponent(searchQuery)}`,
          { credentials: 'include' }
        );

        const data = await response.json();

        if (response.status === 401) {
          redirectToLanding('session_expired');
          return;
        }

        if (!response.ok) {
          throw new Error(data.message || data.error || `Repository search failed: ${response.status}`);
        }

        const results = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
        setSearchResults(results);
      } catch (err) {
        console.error("Search error:", err);
        setError("Could not search repositories. Please try again later.");
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, API_URL, redirectToLanding, selectedRepo]);

  const handleSelectRepo = (repo: Repository) => {
    setSelectedRepo(repo);
    setSearchQuery(repo.full_name);
    setShowDropdown(false);
    setError("");
  };

  const handleOpenWorkspace = async () => {
    const targetRepo = inputMode === 'search' ? selectedRepo : extractRepoFromLink(repoLink);

    if (!targetRepo) {
      setError(inputMode === 'search' 
        ? "Please select a repository from the search results." 
        : "Invalid repository link. Please enter a GitHub repository link (e.g., https://github.com/owner/repo).");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const repoData = normalizeRepositorySelection(targetRepo);

      sessionStorage.setItem('selectedRepo', JSON.stringify(repoData));
      navigate(`/editor?repo=${encodeURIComponent(repoData.fullName)}`);
    } catch (err) {
      console.error("Workspace init error:", err);
      setError("Failed to initialize workspace. Please try again.");
      setIsLoading(false);
    }
  };

  const openLocalDemoWorkspace = () => {
    if (!localDemoRepo) return;
    sessionStorage.setItem('selectedRepo', JSON.stringify(localDemoRepo));
    navigate('/editor');
  };

  const handleJoinTeam = async () => {
    const normalized = normalizeTeamCode(teamCode);
    if (!normalized) {
      setError("Please enter a valid 6-digit team code.");
      return;
    }

    setIsJoiningTeam(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/team-sessions/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized }),
        credentials: 'include',
      });

      const data = await response.json();

      if (response.status === 401) {
        redirectToLanding('session_expired');
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to join team session.");
      }

      sessionStorage.setItem('teamSession', JSON.stringify(data.session));
      sessionStorage.setItem('selectedRepo', JSON.stringify(data.session.repo));
      navigate(`/editor?repo=${encodeURIComponent(data.session.repo.fullName)}&team=${normalized}`);
    } catch (err) {
      console.error("Join team error:", err);
      setError(err instanceof Error ? err.message : "Session not found or expired.");
    } finally {
      setIsJoiningTeam(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#09090b] selection:bg-indigo-100 selection:text-indigo-900">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-12 lg:py-24">
        <div className="flex flex-col items-center text-center mb-16 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-200 dark:shadow-none mb-6">
            <BookOpenText className="text-white w-7 h-7" />
          </div>
          <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 mb-4">{PRODUCT_NAME} Command Center</h1>
          <p className="text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Select a repository to begin editing or enter a session code to collaborate with your team in real-time.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Repository Section */}
          <div className="space-y-6 animate-in fade-in slide-in-from-left-6 duration-700 delay-150">
            <div className="p-8 rounded-3xl bg-white border border-zinc-200 shadow-xl shadow-zinc-200/50 dark:shadow-none dark:bg-zinc-900 dark:border-zinc-800">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center">
                  <Github className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Open Repository</h2>
                  <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">GitHub Integration</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
                  <button
                    onClick={() => setInputMode('search')}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                      inputMode === 'search'
                        ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                    }`}
                  >
                    Search
                  </button>
                  <button
                    onClick={() => setInputMode('link')}
                    className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                      inputMode === 'link'
                        ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                    }`}
                  >
                    Paste Link
                  </button>
                </div>

                {inputMode === 'search' ? (
                  <div className="relative" ref={searchRef}>
                    <div className="relative group">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                      <input
                        data-testid="repo-search-input"
                        type="text"
                        placeholder="Search your GitHub repositories..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 outline-none transition-all"
                      />
                    </div>

                    {showDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
                        {isSearching ? (
                          <div className="p-8 text-center">
                            <div className="w-8 h-8 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Searching GitHub...</p>
                          </div>
                        ) : searchResults.length === 0 ? (
                          <div className="p-8 text-center">
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">No repositories found for "{searchQuery}"</p>
                          </div>
                        ) : (
                          <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                            {searchResults.map((repo) => (
                              <button
                                key={repo.id}
                                onClick={() => handleSelectRepo(repo)}
                                className="w-full flex items-center gap-3 p-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors text-left group"
                              >
                                <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 transition-colors">
                                  <FolderOpen className="w-4 h-4 text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{repo.full_name}</div>
                                  <div className="text-[10px] text-zinc-400 font-medium uppercase tracking-tight truncate">{repo.description || 'No description provided'}</div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-md bg-zinc-50 dark:bg-zinc-800 text-[10px] font-bold text-zinc-500">
                                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                  {repo.stargazers_count}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative group">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                    <input
                      data-testid="repo-link-input"
                      type="text"
                      placeholder="https://github.com/owner/repository"
                      value={repoLink}
                      onChange={(e) => setRepoLink(e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 outline-none transition-all"
                    />
                  </div>
                )}

                {error && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold flex items-center gap-2 dark:bg-rose-950/20 dark:border-rose-900/50">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  data-testid="open-workspace-submit"
                  onClick={handleOpenWorkspace}
                  disabled={isLoading || (inputMode === 'search' && !selectedRepo) || (inputMode === 'link' && !repoLink)}
                  className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold shadow-xl shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale disabled:pointer-events-none"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span className="uppercase tracking-widest text-xs">Initializing Session...</span>
                    </>
                  ) : (
                    <>
                      <Layers3 className="w-5 h-5" />
                      <span className="uppercase tracking-widest text-xs">Launch Project Workspace</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {localTestMode && localDemoRepo && (
              <button
                type="button"
                data-testid="open-demo-workspace"
                className="w-full p-6 rounded-3xl bg-indigo-50/50 border border-indigo-100 dark:bg-indigo-950/10 dark:border-indigo-900/30 flex items-center justify-between group cursor-pointer text-left"
                onClick={openLocalDemoWorkspace}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 flex items-center justify-center shadow-sm">
                    <Plus className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Try Sample Course</h3>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Local Demo Repository</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-indigo-300 group-hover:text-indigo-600 transition-colors" />
              </button>
            )}
          </div>

          {/* Team Section */}
          <div className="space-y-6 animate-in fade-in slide-in-from-right-6 duration-700 delay-300">
            <div className="p-8 rounded-3xl bg-white border border-zinc-200 shadow-xl shadow-zinc-200/50 dark:shadow-none dark:bg-zinc-900 dark:border-zinc-800 h-full">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                  <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Join Session</h2>
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Live Collaboration</p>
                </div>
              </div>

              <div className="space-y-6">
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Enter the unique 6-digit code provided by your co-author to join their active workspace session.
                </p>

                <div className="relative group">
                  <input
                    data-testid="team-code-input"
                    type="text"
                    maxLength={6}
                    placeholder="ENTER CODE"
                    value={teamCode}
                    onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-2xl font-black text-center text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-200 dark:placeholder:text-zinc-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 outline-none transition-all tracking-[0.5em]"
                  />
                </div>

                <button
                  onClick={handleJoinTeam}
                  disabled={isJoiningTeam || teamCode.length < 6}
                  className="w-full py-4 rounded-2xl bg-zinc-900 text-white font-bold shadow-xl shadow-zinc-200 dark:shadow-none hover:bg-zinc-800 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale disabled:pointer-events-none dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                >
                  {isJoiningTeam ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white dark:border-zinc-900/20 dark:border-t-zinc-900 rounded-full animate-spin" />
                      <span className="uppercase tracking-widest text-xs">Connecting...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="uppercase tracking-widest text-xs">Join Active Session</span>
                    </>
                  )}
                </button>

                <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 mt-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <Star className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">Cursors and text sync across all participants instantly.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Star className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-medium">Session state is persisted for 24 hours.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RepoInputPage;
