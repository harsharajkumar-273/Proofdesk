import React, { useEffect, useRef, useState } from 'react';
import { BookOpenText, Github, Loader2, RefreshCw, X } from 'lucide-react';
import { PRODUCT_NAME } from '../utils/brand';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

type Status = 'loading' | 'ready' | 'building' | 'error';

const DemoPage: React.FC = () => {
  const [status, setStatus] = useState<Status>('loading');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDemo = async () => {
    try {
      const res = await fetch(`${API_URL}/demo`, { credentials: 'include' });
      const data = await res.json() as { sessionId?: string; building?: boolean; error?: string };
      if (res.status === 503 && data.building) {
        setStatus('building');
        return false;
      }
      if (!res.ok || !data.sessionId) {
        setStatus('error');
        return true;
      }
      setPreviewUrl(`${API_URL}/preview/${data.sessionId}/overview.html`);
      setStatus('ready');
      return true;
    } catch {
      setStatus('error');
      return true;
    }
  };

  useEffect(() => {
    fetchDemo().then((done) => {
      if (!done) {
        pollRef.current = setInterval(async () => {
          const finished = await fetchDemo();
          if (finished && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 10000);
      }
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">

      {/* Header bar */}
      <div className="flex-shrink-0 h-11 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-3 z-10">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
            <BookOpenText className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-sm text-white">{PRODUCT_NAME}</span>
        </div>

        <div className="h-4 w-px bg-zinc-700 flex-shrink-0" />

        <span className="text-xs text-zinc-400 truncate">
          Demo · Interactive Linear Algebra textbook (read-only)
        </span>

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <a
            href={`${API_URL}/auth/github`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            Sign in to edit
          </a>
        </div>
      </div>

      {/* Sign-in nudge banner */}
      {!bannerDismissed && status === 'ready' && (
        <div className="flex-shrink-0 bg-indigo-600 px-4 py-2 flex items-center gap-3 text-white text-xs z-10">
          <span className="flex-1">
            <strong>You're in demo mode.</strong> Browse the live textbook below.
            Sign in with GitHub to open the full editor, edit source files, and rebuild.
          </span>
          <a
            href={`${API_URL}/auth/github`}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/20 hover:bg-white/30 font-semibold transition-colors whitespace-nowrap"
          >
            <Github className="w-3 h-3" /> Sign in free
          </a>
          <button
            onClick={() => setBannerDismissed(true)}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden relative">
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-zinc-400 text-sm">Loading demo…</p>
          </div>
        )}

        {status === 'building' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <div>
              <p className="text-white font-semibold mb-1">Demo is building</p>
              <p className="text-zinc-400 text-sm max-w-sm">
                The first build of the ILA textbook takes about 15–20 minutes.
                This page will update automatically when it's ready.
              </p>
            </div>
            <a
              href={`${API_URL}/auth/github`}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
            >
              <Github className="w-4 h-4" /> Sign in and build your own repo
            </a>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center">
            <p className="text-white font-semibold mb-1">Demo unavailable</p>
            <p className="text-zinc-400 text-sm max-w-sm">
              The demo could not be loaded right now. Sign in with GitHub to use the full workspace.
            </p>
            <a
              href={`${API_URL}/auth/github`}
              className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
            >
              <Github className="w-4 h-4" /> Sign in with GitHub
            </a>
          </div>
        )}

        {status === 'ready' && previewUrl && (
          <iframe
            src={previewUrl}
            className="w-full h-full border-none"
            title="Proofdesk Demo — Interactive Linear Algebra"
          />
        )}
      </div>
    </div>
  );
};

export default DemoPage;
