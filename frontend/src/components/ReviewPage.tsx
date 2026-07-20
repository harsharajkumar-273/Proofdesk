import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, BookOpen } from 'lucide-react';
import { PRODUCT_NAME } from '../utils/brand';

const ReviewPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  const [status, setStatus] = useState<'checking' | 'ready' | 'not-found'>('checking');
  const [repoName, setRepoName] = useState<string>('');

  const previewSrc = sessionId
    ? `${API_URL}/preview/${sessionId}/overview.html`
    : null;

  useEffect(() => {
    if (!sessionId || !/^[0-9a-f]{16}$/.test(sessionId)) {
      setStatus('not-found');
      return;
    }

    fetch(`${API_URL}/preview/${sessionId}/overview.html`, { method: 'HEAD' })
      .then((res) => {
        if (res.ok) {
          setStatus('ready');
        } else {
          setStatus('not-found');
        }
      })
      .catch(() => setStatus('not-found'));

    fetch(`${API_URL}/workspace/${sessionId}/meta`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { repo?: string } | null) => {
        if (data?.repo) setRepoName(data.repo);
      })
      .catch(() => {});
  }, [sessionId, API_URL]);

  if (status === 'checking') {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-4 text-zinc-500">
          <div className="w-8 h-8 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-sm">Loading preview…</span>
        </div>
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center max-w-sm">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-zinc-300" />
          <h1 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-2">
            Preview not available
          </h1>
          <p className="text-sm text-zinc-500 mb-6">
            This preview link may have expired or the textbook hasn't been built yet.
          </p>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {PRODUCT_NAME}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden">
      {/* Minimal toolbar */}
      <header className="flex items-center justify-between h-10 px-4 bg-zinc-900 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest select-none">
            {PRODUCT_NAME}
          </span>
          {repoName && (
            <>
              <span className="text-zinc-700 text-xs select-none">/</span>
              <span className="text-sm text-zinc-200 font-medium truncate max-w-[260px]" title={repoName}>
                {repoName}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 select-none">
            Read-only
          </span>
          <a
            href={previewSrc ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open in new tab</span>
          </a>
        </div>
      </header>

      {/* Fullscreen preview iframe */}
      <iframe
        src={previewSrc ?? ''}
        className="flex-1 w-full"
        style={{ border: 'none', background: 'white' }}
        title="Textbook preview"
      />
    </div>
  );
};

export default ReviewPage;
