import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface WorkspaceNotice {
  tone: 'error' | 'success' | 'info';
  title: string;
  advice?: string;
  details?: string;
  actionLabel?: string;
}

interface WorkspaceNoticeBannerProps {
  notice: WorkspaceNotice | null;
  onAction: () => void;
  onDismiss: () => void;
}

const WorkspaceNoticeBanner: React.FC<WorkspaceNoticeBannerProps> = ({
  notice,
  onAction,
  onDismiss,
}) => {
  if (!notice) {
    return null;
  }

  return (
    <div className={`border-b px-4 py-3 text-sm ${
      notice.tone === 'error'
        ? 'border-rose-900/50 bg-rose-950/70 text-rose-100'
        : notice.tone === 'success'
          ? 'border-emerald-900/50 bg-emerald-950/60 text-emerald-100'
          : 'border-cyan-900/40 bg-slate-900/80 text-cyan-100'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="font-medium">{notice.title}</p>
          </div>
          {notice.advice && (
            <p className="mt-1 text-xs opacity-90">{notice.advice}</p>
          )}
          {notice.details && (
            <details className="mt-2 text-xs opacity-90">
              <summary className="cursor-pointer select-none">Show details</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-950/70 p-3 text-[11px] leading-5 text-slate-200">
                {notice.details}
              </pre>
            </details>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {notice.actionLabel && (
            <button
              onClick={onAction}
              className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
            >
              {notice.actionLabel}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="rounded-full border border-white/10 p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            title="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceNoticeBanner;
