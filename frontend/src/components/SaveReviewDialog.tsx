import React from 'react';
import { CheckCircle2, FileText, X } from 'lucide-react';
import { type TabChangeSummary } from '../utils/editorDiff';

interface SaveReviewDialogProps {
  isOpen: boolean;
  changes: TabChangeSummary[];
  isSaving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const SaveReviewDialog: React.FC<SaveReviewDialogProps> = ({
  isOpen,
  changes,
  isSaving,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const totalChangedLines = changes.reduce((sum, change) => sum + change.changedLines, 0);

  return (
    <div className="editor-review-modal fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4">
      <div className="w-full max-w-3xl rounded-3xl border border-blue-100 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-blue-100 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Review Before Saving</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Confirm the changes going back to GitHub</h2>
            <p className="mt-2 text-sm text-slate-600">
              {changes.length} file{changes.length === 1 ? '' : 's'} changed, about {totalChangedLines} edited line
              {totalChangedLines === 1 ? '' : 's'}.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            title="Close review"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <div className="space-y-3">
            {changes.map((change) => (
              <div key={change.id} className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-700" />
                      <p className="truncate text-sm font-semibold text-slate-900">{change.name}</p>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{change.path}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">+{change.addedLines}</span>
                    <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-700">-{change.removedLines}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                      ~{change.changedLines} lines
                    </span>
                  </div>
                </div>
                {change.preview && (
                  <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-600">
                    {change.preview}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-blue-100 px-6 py-4">
          <p className="text-sm text-slate-500">You can still go back, edit more, or save only after this review.</p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Keep Editing
            </button>
            <button
              onClick={onConfirm}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SaveReviewDialog;
