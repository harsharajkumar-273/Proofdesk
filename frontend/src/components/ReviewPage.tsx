import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  BookOpen,
  MessageSquare,
  Plus,
  CheckCircle2,
  Trash2,
  X,
  Clock,
  Tag,
  Send,
} from 'lucide-react';
import { PRODUCT_NAME } from '../utils/brand';

export interface ReviewAnnotation {
  id: string;
  sessionId: string;
  section: string;
  author: string;
  text: string;
  timestamp: string;
  resolved: boolean;
}

export const ReviewPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

  const [status, setStatus] = useState<'checking' | 'ready' | 'not-found'>('checking');
  const [repoName, setRepoName] = useState<string>('');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');

  // Annotation Form State
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [newSection, setNewSection] = useState<string>('');
  const [newAuthor, setNewAuthor] = useState<string>('');
  const [newText, setNewText] = useState<string>('');

  // Annotations List Persistence
  const [annotations, setAnnotations] = useState<ReviewAnnotation[]>(() => {
    if (!sessionId) return [];
    try {
      const stored = localStorage.getItem(`proofdesk_review_annotations_${sessionId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (sessionId && annotations) {
      localStorage.setItem(`proofdesk_review_annotations_${sessionId}`, JSON.stringify(annotations));
    }
  }, [sessionId, annotations]);

  const previewSrc = sessionId ? `${API_URL}/preview/${sessionId}/overview.html` : null;

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

  const handleAddAnnotation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;

    const annotation: ReviewAnnotation = {
      id: Date.now().toString(),
      sessionId: sessionId || 'demo',
      section: newSection.trim() || 'General Feedback',
      author: newAuthor.trim() || 'Anonymous Reviewer',
      text: newText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      resolved: false,
    };

    setAnnotations((prev) => [annotation, ...prev]);
    setNewText('');
    setNewSection('');
    setIsAdding(false);
  };

  const toggleResolved = (id: string) => {
    setAnnotations((prev) =>
      prev.map((ann) => (ann.id === id ? { ...ann, resolved: !ann.resolved } : ann))
    );
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((ann) => ann.id !== id));
  };

  const filteredAnnotations = annotations.filter((ann) => {
    if (filter === 'active') return !ann.resolved;
    if (filter === 'resolved') return ann.resolved;
    return true;
  });

  const activeCount = annotations.filter((a) => !a.resolved).length;

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
    <div className="h-screen flex flex-col bg-zinc-950 overflow-hidden text-zinc-100">
      {/* Header Toolbar */}
      <header className="flex items-center justify-between h-11 px-4 bg-zinc-900 border-b border-zinc-800 flex-shrink-0 z-20">
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
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-950 text-indigo-300 border border-indigo-800/50">
            Reviewer Mode
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isDrawerOpen
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            title="Toggle Review Feedback Panel"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Comments</span>
            {activeCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-950 text-indigo-200 font-bold border border-indigo-700">
                {activeCount}
              </span>
            )}
          </button>

          <a
            href={previewSrc ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title="Open preview in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New tab</span>
          </a>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Fullscreen Preview Iframe */}
        <div className="flex-1 h-full bg-white relative">
          <iframe
            src={previewSrc ?? ''}
            className="w-full h-full"
            style={{ border: 'none' }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            title="Textbook preview"
          />
        </div>

        {/* Feedback Annotations Drawer */}
        {isDrawerOpen && (
          <aside className="w-80 sm:w-96 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full z-10 shadow-2xl transition-all">
            {/* Drawer Header */}
            <div className="p-3.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                  Reviewer Annotations ({annotations.length})
                </h2>
              </div>
              <button
                onClick={() => setIsAdding(!isAdding)}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Note</span>
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center border-b border-zinc-800 px-3 bg-zinc-950/40 text-xs">
              <button
                onClick={() => setFilter('all')}
                className={`py-2 px-3 border-b-2 font-medium transition-colors ${
                  filter === 'all'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All ({annotations.length})
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`py-2 px-3 border-b-2 font-medium transition-colors ${
                  filter === 'active'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Active ({activeCount})
              </button>
              <button
                onClick={() => setFilter('resolved')}
                className={`py-2 px-3 border-b-2 font-medium transition-colors ${
                  filter === 'resolved'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Resolved ({annotations.length - activeCount})
              </button>
            </div>

            {/* Add Annotation Form Modal/Collapse */}
            {isAdding && (
              <form onSubmit={handleAddAnnotation} className="p-3 bg-zinc-950/80 border-b border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                    <Tag className="w-3 h-3" /> New Section Annotation
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Section / Line ref..."
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="Your Name..."
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <textarea
                  rows={3}
                  placeholder="Type feedback, suggestions or correction details..."
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
                  required
                />

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-3 py-1 rounded text-xs text-zinc-400 hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1 px-3 py-1 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 transition-colors"
                  >
                    <Send className="w-3 h-3" /> Save Note
                  </button>
                </div>
              </form>
            )}

            {/* Annotations List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {filteredAnnotations.length === 0 ? (
                <div className="text-center py-10 px-4 text-zinc-500">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-medium">No feedback comments found.</p>
                  <p className="text-[11px] mt-1 text-zinc-600">
                    Click "Add Note" to annotate a section or line for the author.
                  </p>
                </div>
              ) : (
                filteredAnnotations.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg border transition-all ${
                      item.resolved
                        ? 'bg-zinc-950/40 border-zinc-800/60 opacity-60'
                        : 'bg-zinc-950 border-zinc-800 hover:border-indigo-500/50 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                          {item.section}
                        </span>
                        <span className="text-xs font-semibold text-zinc-300">{item.author}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {item.timestamp}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-300 whitespace-pre-wrap mb-2.5 leading-relaxed">
                      {item.text}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-900 text-xs">
                      <button
                        onClick={() => toggleResolved(item.id)}
                        className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${
                          item.resolved
                            ? 'text-emerald-400 hover:text-emerald-300'
                            : 'text-zinc-400 hover:text-emerald-400'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{item.resolved ? 'Resolved' : 'Mark Resolved'}</span>
                      </button>

                      <button
                        onClick={() => deleteAnnotation(item.id)}
                        className="text-zinc-500 hover:text-rose-400 transition-colors p-1"
                        title="Delete Annotation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default ReviewPage;
