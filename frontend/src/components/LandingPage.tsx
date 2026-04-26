import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenText,
  Check,
  Code2,
  Eye,
  Github,
  GitBranch,
  Play,
  Search,
  Share2,
  Users,
  Zap,
} from 'lucide-react';
import { isLocalTestModeEnabled } from '../utils/localTestMode';
import { PRODUCT_NAME } from '../utils/brand';

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

interface LandingPageProps {
  hasWorkspaceAccess: boolean;
  entryNotice?: {
    tone: 'error' | 'info';
    title: string;
    detail: string;
  } | null;
}

const FEATURES = [
  {
    icon: Eye,
    title: 'Live Preview',
    desc: 'Edit source XML and see the fully-rendered textbook update in real time — equations, figures, and all.',
  },
  {
    icon: Users,
    title: 'Real-Time Collaboration',
    desc: 'Co-authors share cursors and edits in the same session. No conflicting file versions, no email threads.',
  },
  {
    icon: Search,
    title: 'Full-Text Search',
    desc: 'Search every file in the repository instantly. Click a result and jump straight to that line in the editor.',
  },
  {
    icon: Share2,
    title: 'Shareable Previews',
    desc: 'Generate a public link to the compiled textbook in one click. No GitHub account needed to view it.',
  },
  {
    icon: GitBranch,
    title: 'Git Built-in',
    desc: 'Commit, push, pull, and manage branches without leaving the browser. Full git workflow, no terminal required.',
  },
  {
    icon: Zap,
    title: 'Export Anywhere',
    desc: 'Download the compiled output as a self-contained ZIP and host it anywhere — no server dependency.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Sign in with GitHub',
    desc: 'Connect your GitHub account and select the PreTeXt course repository you want to work on.',
  },
  {
    n: '02',
    title: 'Open the workspace',
    desc: 'Proofdesk clones the repository, builds the textbook, and opens a split editor + live preview in under a minute.',
  },
  {
    n: '03',
    title: 'Edit, review, publish',
    desc: 'Write source in the editor, watch the preview update, and push your changes back to GitHub when ready.',
  },
];

const LandingPage: React.FC<LandingPageProps> = ({ hasWorkspaceAccess, entryNotice = null }) => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
  const showLocalTestAccess = isLocalTestModeEnabled();

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">

      {/* ── Nav ── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-zinc-100 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <BookOpenText className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">{PRODUCT_NAME}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/demo"
              className="hidden items-center gap-1.5 px-4 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors sm:flex"
            >
              <Play className="w-3.5 h-3.5" /> Try Demo
            </Link>
            {hasWorkspaceAccess ? (
              <Link
                to="/workspace"
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
              >
                Open Workspace <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <>
                <a
                  href={`${backendUrl}/auth/github`}
                  className="hidden sm:flex items-center gap-2 px-4 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                >
                  <Github className="w-3.5 h-3.5" /> GitHub
                </a>
                <a
                  href={`${backendUrl}/auth/google`}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  <GoogleIcon className="w-3.5 h-3.5" /> Sign in
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">

          {entryNotice && (
            <div className={`mb-8 max-w-lg mx-auto p-4 rounded-xl border text-sm flex gap-3 ${
              entryNotice.tone === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300'
                : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300'
            }`}>
              <div>
                <p className="font-semibold">{entryNotice.title}</p>
                <p className="opacity-80 mt-0.5">{entryNotice.detail}</p>
              </div>
            </div>
          )}

          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase tracking-widest">
              Open-Source · PreTeXt · Math Publishing
            </div>
            <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
              The editor your<br />
              <span className="text-indigo-600 dark:text-indigo-400">math textbook</span> deserves.
            </h1>
            <p className="text-xl text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-2xl mx-auto mb-10">
              Proofdesk is a browser-based workspace for professors and course authors.
              Write PreTeXt source, see rendered equations instantly, collaborate with co-authors,
              and publish — all without leaving the browser.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {hasWorkspaceAccess ? (
                <Link
                  to="/workspace"
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none active:scale-[0.98]"
                >
                  Open Workspace <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <>
                  <a
                    data-testid="github-login-button"
                    href={`${backendUrl}/auth/github`}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-base hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-all shadow-lg shadow-zinc-200 dark:shadow-none active:scale-[0.98]"
                  >
                    <Github className="w-5 h-5" /> Sign in with GitHub
                  </a>
                  <a
                    data-testid="google-login-button"
                    href={`${backendUrl}/auth/google`}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold text-base hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-none active:scale-[0.98]"
                  >
                    <GoogleIcon className="w-5 h-5" /> Sign in with Google
                  </a>
                  <Link
                    to="/demo"
                    className="flex items-center gap-2 px-6 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold text-base hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                  >
                    <Play className="w-4 h-4" /> Try Demo
                  </Link>
                  {showLocalTestAccess && (
                    <a
                      data-testid="local-demo-login"
                      href={`${backendUrl}/auth/local-test`}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-semibold text-base hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                    >
                      Try Local Demo
                    </a>
                  )}
                </>
              )}
            </div>
            <p className="mt-4 text-xs text-zinc-400">Free to use · No credit card · Sign in with GitHub or Google</p>
          </div>

          {/* Product Mockup */}
          <div className="relative max-w-5xl mx-auto rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-zinc-200/60 dark:shadow-none">
            {/* Browser chrome */}
            <div className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 mx-4">
                <div className="max-w-xs mx-auto bg-white dark:bg-zinc-800 rounded-md px-3 py-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono text-center border border-zinc-200 dark:border-zinc-700">
                  proofdesk.app/editor
                </div>
              </div>
            </div>
            {/* Simulated editor UI */}
            <div className="flex h-[540px] flex-col bg-zinc-950 sm:h-[340px] sm:flex-row">
              {/* Sidebar */}
              <div className="h-32 flex-shrink-0 border-b border-zinc-800 bg-zinc-900 p-3 sm:h-auto sm:w-44 sm:border-b-0 sm:border-r">
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 px-1">Explorer</div>
                <div className="grid grid-cols-3 gap-1 sm:block">
                  {['src/', 'images/', 'output/'].map((f, i) => (
                    <div key={f} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${i === 0 ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                      {f}
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 sm:mt-1 sm:block sm:pl-3">
                  {['chapter1.ptx', 'chapter2.ptx', 'preface.ptx'].map((f, i) => (
                    <div key={f} className={`flex min-w-0 items-center gap-2 rounded px-2 py-1 text-xs ${i === 0 ? 'text-indigo-400 bg-indigo-950/40' : 'text-zinc-500'}`}>
                      <Code2 className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Editor pane */}
              <div className="min-h-0 flex-1 overflow-hidden border-b border-zinc-800 p-4 font-mono text-xs leading-relaxed sm:border-b-0 sm:border-r">
                <div className="text-zinc-500 select-none mb-1 text-[10px]">chapter1.ptx</div>
                {[
                  ['text-zinc-500', '<section xml:id="lin-systems">'],
                  ['text-zinc-400', '  <title>Linear Systems</title>'],
                  ['text-zinc-500', '  <p>Consider the system'],
                  ['text-zinc-500', '    <me>'],
                  ['text-indigo-400', '      Ax = b'],
                  ['text-zinc-500', '    </me>'],
                  ['text-zinc-500', '  </p>'],
                  ['text-zinc-400', '  <theorem xml:id="thm-existence">'],
                  ['text-zinc-500', '    <statement>'],
                  ['text-zinc-400', '      <p>A solution exists if and only if'],
                  ['text-zinc-500', '        <m>b \\in \\Col(A)</m>.'],
                  ['text-zinc-400', '      </p>'],
                ].map(([cls, line], i) => (
                  <div key={i} className="flex gap-3">
                    <span className="text-zinc-700 w-4 text-right flex-shrink-0">{i + 1}</span>
                    <span className={cls}>{line}</span>
                  </div>
                ))}
                <div className="flex gap-3 mt-0.5">
                  <span className="text-zinc-700 w-4 text-right flex-shrink-0">13</span>
                  <span className="text-zinc-500 border-l-2 border-indigo-500 pl-1 animate-pulse">&nbsp;</span>
                </div>
              </div>
              {/* Preview pane */}
              <div className="min-h-0 flex-1 overflow-hidden bg-white p-5">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Eye className="w-3 h-3" /> Live Preview
                  <span className="ml-auto flex items-center gap-1 text-green-600 font-normal">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Draft
                  </span>
                </div>
                <h2 className="text-sm font-bold text-zinc-900 mb-2">1.1 Linear Systems</h2>
                <p className="text-[11px] text-zinc-600 leading-relaxed mb-3">Consider the system</p>
                <div className="text-center my-3 p-2 bg-zinc-50 rounded text-sm font-serif text-zinc-800 italic">
                  <span className="font-bold not-italic font-sans text-zinc-900">Ax</span>
                  <span className="mx-1 text-zinc-600">=</span>
                  <span className="font-bold not-italic font-sans text-zinc-900">b</span>
                </div>
                <div className="border border-zinc-200 rounded-lg p-2.5 mt-3">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Theorem 1.1</div>
                  <p className="text-[11px] text-zinc-600 leading-relaxed">
                    A solution exists if and only if <em className="text-zinc-800 not-italic font-medium">b ∈ Col(A)</em>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-6 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold tracking-tight mb-3">Everything a course author needs</h2>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto">
              Built specifically for PreTeXt math publishing. No generic IDE hacks.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center mb-4 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 transition-colors">
                  <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-50 mb-1.5">{title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold tracking-tight mb-3">Up and running in minutes</h2>
            <p className="text-zinc-500 dark:text-zinc-400">
              No local setup. No Docker. No command line. Just a browser.
            </p>
          </div>
          <div className="relative">
            <div className="absolute left-[39px] top-10 bottom-10 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />
            <div className="space-y-8">
              {STEPS.map(({ n, title, desc }) => (
                <div key={n} className="flex gap-6 items-start">
                  <div className="w-20 h-20 flex-shrink-0 rounded-2xl bg-indigo-600 flex flex-col items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none">
                    <span className="text-[10px] font-bold opacity-60 tracking-widest">{n}</span>
                  </div>
                  <div className="pt-4">
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-50 text-lg mb-1">{title}</h3>
                    <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 px-6 bg-indigo-600 dark:bg-indigo-700">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4 tracking-tight">
            Start editing your textbook today.
          </h2>
          <p className="text-indigo-200 mb-8 text-lg">
            Free for educators. Open source. Works with any PreTeXt repository.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {hasWorkspaceAccess ? (
              <Link
                to="/workspace"
                className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-indigo-700 font-bold text-base hover:bg-indigo-50 transition-all shadow active:scale-[0.98]"
              >
                Open Workspace <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <a
                  href={`${backendUrl}/auth/github`}
                  className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-zinc-900 font-bold text-base hover:bg-zinc-100 transition-all shadow active:scale-[0.98]"
                >
                  <Github className="w-5 h-5" /> Sign in with GitHub
                </a>
                <a
                  href={`${backendUrl}/auth/google`}
                  className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-zinc-900 font-bold text-base hover:bg-zinc-100 transition-all shadow active:scale-[0.98]"
                >
                  <GoogleIcon className="w-5 h-5" /> Sign in with Google
                </a>
                <Link
                  to="/demo"
                  className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-base transition-all shadow active:scale-[0.98]"
                >
                  <Play className="w-4 h-4" /> Try Demo
                </Link>
              </>
            )}
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-indigo-200 text-sm">
            {['No setup required', 'GitHub or Google sign-in', 'Export anytime'].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-100 dark:border-zinc-800 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-zinc-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <BookOpenText className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{PRODUCT_NAME}</span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span>© 2026</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://github.com/harsharajkumar/proofdesk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
              <Github className="w-4 h-4" /> GitHub
            </a>
            <Link to="/terms" className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
