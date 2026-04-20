import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenText,
  Github,
  History,
  Layout,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { isLocalTestModeEnabled } from '../utils/localTestMode';
import { PRODUCT_NAME } from '../utils/brand';

interface ProfessorDashboardPageProps {
  hasWorkspaceAccess: boolean;
  entryNotice?: {
    tone: 'error' | 'info';
    title: string;
    detail: string;
  } | null;
}

const ProfessorDashboardPage: React.FC<ProfessorDashboardPageProps> = ({ 
  hasWorkspaceAccess, 
  entryNotice = null 
}) => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  const showLocalTestAccess = isLocalTestModeEnabled();

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#09090b] selection:bg-indigo-100 selection:text-indigo-900">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-12 lg:py-20">
        {/* Header Section */}
        <header className="flex items-center justify-between mb-16 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
              <BookOpenText className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{PRODUCT_NAME}</h1>
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 tracking-widest uppercase">Academic Workspace</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="grid lg:grid-cols-[1fr_400px] gap-12 items-start">
          <div className="space-y-10 animate-in fade-in slide-in-from-left-6 duration-700 delay-150">
            {entryNotice && (
              <div data-testid="entry-notice" className={`p-4 rounded-xl border flex gap-3 ${
                entryNotice.tone === 'error' 
                ? 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/20 dark:border-rose-900/50 dark:text-rose-200' 
                : 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/20 dark:border-blue-900/50 dark:text-blue-200'
              }`}>
                <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-sm">{entryNotice.title}</h3>
                  <p className="text-sm opacity-80 mt-1">{entryNotice.detail}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900/50">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">Ready for Deployment</span>
              </div>
              <h2 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.1]">
                Review, Edit, and Publish <br/> 
                <span className="text-indigo-600 dark:text-indigo-400">Mathematical Coursework.</span>
              </h2>
              <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
                A unified repository workspace for textbooks. Move from source to preview, 
                collaborate with co-authors, and deploy updates in one elegant environment.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-sm dark:bg-zinc-900 dark:border-zinc-800 transition-all hover:shadow-md group">
                <div className="w-12 h-12 bg-zinc-50 rounded-lg flex items-center justify-center mb-4 dark:bg-zinc-800 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/20 transition-colors">
                  <Layout className="w-6 h-6 text-zinc-600 dark:text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                </div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-50 mb-1 text-lg">Live Preview</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
                  Real-time rendering of PreTeXt source into production-ready HTML and SVG.
                </p>
              </div>
              
              <div className="p-6 rounded-2xl bg-white border border-zinc-200 shadow-sm dark:bg-zinc-900 dark:border-zinc-800 transition-all hover:shadow-md group">
                <div className="w-12 h-12 bg-zinc-50 rounded-lg flex items-center justify-center mb-4 dark:bg-zinc-800 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/20 transition-colors">
                  <Plus className="w-6 h-6 text-zinc-600 dark:text-zinc-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                </div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-50 mb-1 text-lg">Collaborative Review</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
                  Bring co-authors and editors into your session with live cursor tracking and sync.
                </p>
              </div>
            </div>
          </div>

          <aside className="animate-in fade-in slide-in-from-right-6 duration-700 delay-300">
            <div className="sticky top-12 p-8 rounded-3xl bg-white border border-zinc-200 shadow-2xl shadow-indigo-100 dark:shadow-none dark:bg-zinc-900 dark:border-zinc-800 overflow-hidden group">
              {/* Card Decor */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl group-hover:bg-indigo-500/10 transition-colors" />
              
              <div className="relative space-y-8">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2 tracking-tight">Launch Workspace</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Access your course repositories and start editing chapters or verifying builds.
                  </p>
                </div>

                <div className="space-y-3">
                  {hasWorkspaceAccess ? (
                    <Link to="/workspace" className="flex items-center justify-between w-full p-4 rounded-xl bg-indigo-600 text-white font-semibold shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all active:scale-[0.98]">
                      <div className="flex items-center gap-3">
                        <Layout className="w-5 h-5" />
                        <span>Open Workspace</span>
                      </div>
                      <ArrowRight className="w-5 h-5" />
                    </Link>
                  ) : (
                    <>
                      {showLocalTestAccess && (
                        <a data-testid="local-demo-login" href={`${backendUrl}/auth/local-test`} className="flex items-center justify-between w-full p-4 rounded-xl bg-zinc-900 text-white font-semibold shadow-lg shadow-zinc-200 dark:shadow-none hover:bg-zinc-800 transition-all dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white active:scale-[0.98]">
                          <div className="flex items-center gap-3">
                            <Plus className="w-5 h-5" />
                            <span>Local Demo Mode</span>
                          </div>
                          <ArrowRight className="w-5 h-5 opacity-50" />
                        </a>
                      )}

                      <a data-testid="github-login-button" href={`${backendUrl}/auth/github`} className="flex items-center justify-between w-full p-4 rounded-xl border border-zinc-200 bg-white text-zinc-900 font-semibold hover:bg-zinc-50 transition-all dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-800 active:scale-[0.98]">
                        <div className="flex items-center gap-3">
                          <Github className="w-5 h-5" />
                          <span>Continue with GitHub</span>
                        </div>
                        <ArrowRight className="w-5 h-5 opacity-30" />
                      </a>
                    </>
                  )}
                </div>

                <div className="pt-6 border-top border-zinc-100 dark:border-zinc-800">
                  <h4 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-4">Recent Activity</h4>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 opacity-60">
                      <div className="mt-1">
                        <History className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Sign in to see your recently accessed course repositories and chapters.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-center text-zinc-400 dark:text-zinc-600 leading-relaxed italic">
                  &ldquo;Review carefully. Teach confidently.&rdquo;
                </div>
              </div>
            </div>
          </aside>
        </main>

        <footer className="mt-24 pt-8 border-t border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-zinc-500 dark:text-zinc-500 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
          <p>© 2026 {PRODUCT_NAME}. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Documentation</a>
            <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">System Status</a>
            <a href="#" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Terms</a>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ProfessorDashboardPage;
