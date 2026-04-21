import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpenText,
  Code2,
  Eye,
  FolderTree,
  GitBranch,
  X,
} from 'lucide-react';

const TOUR_KEY = 'proofdesk_tour_v1';

const STEPS = [
  {
    icon: BookOpenText,
    title: 'Welcome to Proofdesk',
    desc: "You're in your workspace. Here's a 30-second tour so you know where everything is.",
  },
  {
    icon: FolderTree,
    title: 'File Explorer',
    desc: 'Browse your repository files in the left sidebar. Click any .ptx file to open it in the editor.',
  },
  {
    icon: Code2,
    title: 'Source Editor',
    desc: 'Write PreTeXt XML here. Your changes are saved automatically as you type.',
  },
  {
    icon: Eye,
    title: 'Live Preview',
    desc: 'The right panel shows the compiled textbook. Hit the Build button in the toolbar to refresh after edits.',
  },
  {
    icon: GitBranch,
    title: 'Git Built-in',
    desc: 'Use the Git panel (bottom of the sidebar) to commit and push changes to GitHub — no terminal needed.',
  },
];

const OnboardingTour: React.FC = () => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      // Small delay so the editor finishes loading before the overlay appears
      const t = window.setTimeout(() => setVisible(true), 1200);
      return () => window.clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-7 flex flex-col gap-5">

        {/* Skip */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Skip tour"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
          <Icon className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
        </div>

        {/* Text */}
        <div>
          <p className="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest mb-1">
            {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-50 mb-2 tracking-tight">
            {current.title}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {current.desc}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? 'w-5 bg-indigo-600'
                  : i < step
                  ? 'w-1.5 bg-indigo-300 dark:bg-indigo-700'
                  : 'w-1.5 bg-zinc-200 dark:bg-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={isLast ? dismiss : () => setStep(s => s + 1)}
            className="ml-auto flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
          >
            {isLast ? "Let's go!" : 'Next'}
            {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
