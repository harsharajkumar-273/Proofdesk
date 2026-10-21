import React from 'react';
import { Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import type {
  BuildErrorExplanation as Explanation,
  ExplanationFeedback,
} from '../../hooks/useBuildErrorExplanation';
import { parseLocation } from '../../utils/buildErrorLocation';

interface BuildErrorExplanationProps {
  explanation: Explanation;
  /** Opens the named file at the line. Omitted when the editor cannot open files. */
  onOpenLocation?: (path: string, line: number) => void;
  feedback: ExplanationFeedback;
  /** Omitted when the answer has no id to attach feedback to. */
  onFeedback?: (helpful: boolean) => void;
}

const CONFIDENCE_LABEL: Record<Explanation['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence — double-check',
};

const BuildErrorExplanation: React.FC<BuildErrorExplanationProps> = ({ explanation, onOpenLocation, feedback, onFeedback }) => {
  const target = parseLocation(explanation.location);

  return (
    <section
      aria-label="AI explanation of the build error"
      className="flex-1 overflow-y-auto bg-indigo-950/20 px-5 py-4 text-sm text-zinc-200"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          What went wrong
        </span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          {CONFIDENCE_LABEL[explanation.confidence]}
        </span>
      </div>
      <p className="font-semibold text-zinc-100">{explanation.summary}</p>
      <p className="mt-1.5 leading-relaxed text-zinc-300">{explanation.likelyCause}</p>
      {explanation.location && (
        <p className="mt-2.5 text-xs">
          <span className="text-zinc-500">Look at: </span>
          {target && onOpenLocation ? (
            <button
              type="button"
              onClick={() => onOpenLocation(target.path, target.line)}
              className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-amber-300 underline decoration-dotted underline-offset-2 hover:bg-zinc-700 hover:text-amber-200"
              title="Open this line in the editor"
            >
              {explanation.location}
            </button>
          ) : (
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-amber-300">
              {explanation.location}
            </code>
          )}
        </p>
      )}
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 leading-relaxed text-zinc-300">
        {explanation.fixSteps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
        <p className="text-[11px] text-zinc-500">AI-generated. Check the suggestion against your source before applying it.</p>
        {onFeedback && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            {feedback === 'none' ? (
              <>
                <span>Was this helpful?</span>
                <button
                  type="button"
                  onClick={() => onFeedback(true)}
                  aria-label="Yes, this explanation helped"
                  className="rounded p-1 hover:bg-zinc-800 hover:text-emerald-300"
                >
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onFeedback(false)}
                  aria-label="No, this explanation did not help"
                  className="rounded p-1 hover:bg-zinc-800 hover:text-rose-300"
                >
                  <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </>
            ) : (
              <span role="status">Thanks for the feedback.</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default BuildErrorExplanation;
