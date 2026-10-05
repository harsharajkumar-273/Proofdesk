import React from 'react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { useBuildErrorExplanation, type BuildErrorExplanation as Explanation } from '../../hooks/useBuildErrorExplanation';

interface BuildErrorExplanationProps {
  apiUrl: string;
  /** The full build output to analyse. */
  log: string;
}

const CONFIDENCE_LABEL: Record<Explanation['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence — double-check',
};

const BuildErrorExplanation: React.FC<BuildErrorExplanationProps> = ({ apiUrl, log }) => {
  const { status, explanation, errorMessage, unavailable, explain } = useBuildErrorExplanation(apiUrl);

  if (unavailable) return null;

  if (status === 'success' && explanation) {
    return (
      <section
        aria-label="AI explanation of the build error"
        className="flex-shrink-0 max-h-56 overflow-y-auto border-t border-indigo-900/50 bg-indigo-950/30 px-4 py-3 text-xs text-zinc-200"
      >
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 font-bold text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            What went wrong
          </span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {CONFIDENCE_LABEL[explanation.confidence]}
          </span>
        </div>
        <p className="font-semibold text-zinc-100">{explanation.summary}</p>
        <p className="mt-1 leading-relaxed text-zinc-300">{explanation.likelyCause}</p>
        {explanation.location && (
          <p className="mt-1.5">
            <span className="text-zinc-500">Look at: </span>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-amber-300">
              {explanation.location}
            </code>
          </p>
        )}
        <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed text-zinc-300">
          {explanation.fixSteps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        <p className="mt-2 text-[10px] text-zinc-500">AI-generated. Check the suggestion against your source before applying it.</p>
      </section>
    );
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-t border-zinc-800 bg-zinc-900/60 px-4 py-2">
      <button
        type="button"
        onClick={() => void explain(log)}
        disabled={status === 'loading' || !log.trim()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'loading' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {status === 'loading' ? 'Analyzing…' : status === 'error' ? 'Try again' : 'Explain this error'}
      </button>
      {status === 'error' && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-rose-300">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {errorMessage}
        </p>
      )}
      {status === 'loading' && <span role="status" className="sr-only">Analyzing the build error</span>}
    </div>
  );
};

export default BuildErrorExplanation;
