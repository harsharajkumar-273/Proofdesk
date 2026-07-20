import React from 'react';
import { CheckCircle2, MessageSquareText, Sparkles, Workflow } from 'lucide-react';
import {
  getReviewMarkerLabel,
  type ReviewMarkerEntry,
  type ReviewMarkerStatus,
  type ReviewThreadEntry,
} from '../../utils/editorWorkspace';

interface ReviewSummary {
  filesTracked: number;
  approvedFiles: number;
  requestedFiles: number;
  verifyPreviewFiles: number;
  openThreads: number;
}

interface ReviewWorkflowPanelProps {
  activeFilePath?: string;
  reviewSummary: ReviewSummary;
  reviewEntries: ReviewMarkerEntry[];
  reviewStatus: ReviewMarkerStatus;
  reviewNote: string;
  selectedReviewLine: number | null;
  reviewCommentDraft: string;
  activeThreads: ReviewThreadEntry[];
  setReviewStatus: (value: ReviewMarkerStatus) => void;
  setReviewNote: (value: string) => void;
  setSelectedReviewLine: (value: number) => void;
  setReviewCommentDraft: (value: string) => void;
  onSaveReviewMarker: () => void;
  onAddReviewComment: () => void;
  onResolveThread: (threadId: string) => void;
  onReopenThread: (threadId: string) => void;
  onOpenFile: (path: string, line?: number) => void | Promise<void>;
}

const statusOptions: Array<{ value: ReviewMarkerStatus; label: string }> = [
  { value: 'needs-review', label: 'Needs review' },
  { value: 'changes-requested', label: 'Changes requested' },
  { value: 'verify-preview', label: 'Verify preview' },
  { value: 'approved', label: 'Approved' },
];

const ReviewWorkflowPanel: React.FC<ReviewWorkflowPanelProps> = ({
  activeFilePath,
  reviewSummary,
  reviewEntries,
  reviewStatus,
  reviewNote,
  selectedReviewLine,
  reviewCommentDraft,
  activeThreads,
  setReviewStatus,
  setReviewNote,
  setSelectedReviewLine,
  setReviewCommentDraft,
  onSaveReviewMarker,
  onAddReviewComment,
  onResolveThread,
  onReopenThread,
  onOpenFile,
}) => (
  <section className="rounded-2xl border border-zinc-200 bg-white/90 p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500">Review Workflow</p>
        <h4 className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Track approvals and inline feedback</h4>
      </div>
      <Workflow className="h-4 w-4 text-indigo-500" />
    </div>

    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/80">
        <p className="text-zinc-400">Tracked files</p>
        <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{reviewSummary.filesTracked}</p>
      </div>
      <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/80">
        <p className="text-zinc-400">Open threads</p>
        <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{reviewSummary.openThreads}</p>
      </div>
      <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
        <p>Approved</p>
        <p className="mt-1 text-lg font-semibold">{reviewSummary.approvedFiles}</p>
      </div>
      <div className="rounded-xl bg-rose-50 px-3 py-2 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
        <p>Changes requested</p>
        <p className="mt-1 text-lg font-semibold">{reviewSummary.requestedFiles}</p>
      </div>
    </div>

    <div className="mt-4 space-y-3">
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
          File state
        </label>
        <select
          value={reviewStatus}
          onChange={(event) => setReviewStatus(event.target.value as ReviewMarkerStatus)}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
          Review note
        </label>
        <textarea
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          rows={3}
          placeholder="What should the next reviewer check?"
          className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>

      <button
        onClick={onSaveReviewMarker}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
      >
        <CheckCircle2 className="h-4 w-4" />
        Save review state
      </button>
    </div>

    <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-indigo-500" />
        <h5 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Inline comments</h5>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Attach discussion to the current file by line number. Use the editor cursor to jump between threads quickly.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          type="number"
          min={1}
          value={selectedReviewLine ?? ''}
          onChange={(event) => setSelectedReviewLine(Number(event.target.value || 1))}
          className="w-24 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <input
          type="text"
          value={reviewCommentDraft}
          onChange={(event) => setReviewCommentDraft(event.target.value)}
          placeholder={activeFilePath ? 'Add a reviewer comment…' : 'Open a file to comment'}
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>

      <button
        onClick={onAddReviewComment}
        disabled={!activeFilePath || !reviewCommentDraft.trim() || !selectedReviewLine}
        className="mt-2 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300"
      >
        <Sparkles className="h-4 w-4" />
        Add comment
      </button>

      <div className="mt-4 space-y-2">
        {activeThreads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-xs text-zinc-500 dark:border-zinc-800">
            No inline comments on this file yet.
          </div>
        ) : (
          activeThreads.map((thread) => (
            <div key={thread.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => void onOpenFile(activeFilePath || '', thread.lineNumber)}
                  className="text-left text-sm font-semibold text-zinc-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-300"
                >
                  Line {thread.lineNumber}
                </button>
                <button
                  onClick={() => (thread.status === 'open' ? onResolveThread(thread.id) : onReopenThread(thread.id))}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-zinc-600 ring-1 ring-zinc-200 hover:bg-white dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-900"
                >
                  {thread.status === 'open' ? 'Resolve' : 'Reopen'}
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {thread.comments.map((comment) => (
                  <div key={comment.id} className="rounded-lg bg-white px-3 py-2 text-xs dark:bg-zinc-900">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{comment.author}</span>
                      <span className="text-zinc-400">{new Date(comment.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">{comment.message}</p>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <h5 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Review dashboard</h5>
      <div className="mt-3 space-y-2">
        {reviewEntries.slice(0, 6).map((entry) => (
          <button
            key={entry.path}
            onClick={() => void onOpenFile(entry.path)}
            className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{entry.path}</p>
              {entry.note && <p className="mt-1 truncate text-xs text-zinc-500">{entry.note}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {getReviewMarkerLabel(entry.status)}
            </span>
          </button>
        ))}
      </div>
    </div>
  </section>
);

export default ReviewWorkflowPanel;
