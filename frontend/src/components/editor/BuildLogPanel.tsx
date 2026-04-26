import React, { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface LogLine {
  line: string;
  stream: 'stdout' | 'stderr';
}

interface BuildResult {
  success: boolean;
  entryFile?: string | null;
  artifacts?: Array<{ path: string; type: string }>;
  error?: string;
  stderr?: string;
  stdout?: string;
  sessionId?: string;
  fromCache?: boolean;
  buildType?: string;
  buildInProgress?: boolean;
}

interface BuildLogPanelProps {
  sessionId: string;
  apiUrl: string;
  onComplete: (result: BuildResult) => void;
  onClose: () => void;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const BuildLogPanel: React.FC<BuildLogPanelProps> = ({ sessionId, apiUrl, onComplete, onClose }) => {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(Date.now());
  const esRef = useRef<EventSource | null>(null);

  // Elapsed timer
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 1000);
    return () => clearInterval(id);
  }, [done]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  // SSE connection
  useEffect(() => {
    const url = `${apiUrl}/build/logs/${sessionId}`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { line: string; stream: 'stdout' | 'stderr' };
        setLines((prev) => [...prev, { line: data.line, stream: data.stream }]);
      } catch {
        // ignore malformed messages (heartbeats are comments, not messages)
      }
    };

    es.addEventListener('done', (e: MessageEvent) => {
      es.close();
      esRef.current = null;
      try {
        const buildResult = JSON.parse(e.data) as BuildResult;
        setResult(buildResult);
        setDone(true);
        setElapsed(Date.now() - startedAt.current);
        onComplete(buildResult);
      } catch {
        const fallback: BuildResult = { success: false, error: 'Failed to parse build result' };
        setResult(fallback);
        setDone(true);
        onComplete(fallback);
      }
    });

    es.onerror = () => {
      // EventSource reconnects automatically; only close if we're done
      if (done) es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, apiUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-3xl mx-4 h-[70vh] rounded-2xl overflow-hidden shadow-2xl border border-zinc-700 bg-zinc-950">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            {done ? (
              result?.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              )
            ) : (
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />
            )}
            <span className="text-sm font-bold text-zinc-100">
              {done
                ? result?.success
                  ? 'Build complete'
                  : 'Build failed'
                : 'Building…'}
            </span>
            <span className="text-xs text-zinc-500 font-mono">{formatElapsed(elapsed)}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Log output */}
        <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-5 px-4 py-3 bg-zinc-950">
          {lines.length === 0 && !done && (
            <p className="text-zinc-600 italic">Waiting for build output…</p>
          )}
          {lines.map((entry, i) => (
            <div
              key={i}
              className={entry.stream === 'stderr' ? 'text-amber-400/80' : 'text-zinc-300'}
            >
              {entry.line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        {done && (
          <div
            className={`flex items-center justify-between px-4 py-2.5 border-t flex-shrink-0 ${
              result?.success
                ? 'border-emerald-900/40 bg-emerald-950/30'
                : 'border-rose-900/40 bg-rose-950/30'
            }`}
          >
            <span className={`text-xs font-semibold ${result?.success ? 'text-emerald-400' : 'text-rose-400'}`}>
              {result?.success
                ? `Done in ${formatElapsed(elapsed)} — preview ready`
                : `Failed after ${formatElapsed(elapsed)}`}
            </span>
            <button
              onClick={onClose}
              className="text-xs font-bold text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              {result?.success ? 'Open preview' : 'Dismiss'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BuildLogPanel;
