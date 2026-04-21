import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpenText } from 'lucide-react';
import { PRODUCT_NAME } from '../utils/brand';

interface Section {
  heading: string;
  body: React.ReactNode;
}

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  sections: Section[];
}

const LegalPage: React.FC<LegalPageProps> = ({ title, lastUpdated, sections }) => (
  <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">

    {/* Nav */}
    <nav className="border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <BookOpenText className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight">{PRODUCT_NAME}</span>
        </Link>
        <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          <Link to="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Privacy</Link>
        </div>
      </div>
    </nav>

    {/* Content */}
    <main className="max-w-4xl mx-auto px-6 py-16">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">{title}</h1>
        <p className="text-sm text-zinc-400">Last updated: {lastUpdated}</p>
      </div>

      <div className="prose prose-zinc dark:prose-invert max-w-none space-y-10">
        {sections.map(({ heading, body }) => (
          <section key={heading}>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">{heading}</h2>
            <div className="text-zinc-600 dark:text-zinc-400 leading-relaxed space-y-3">{body}</div>
          </section>
        ))}
      </div>
    </main>

    {/* Footer */}
    <footer className="border-t border-zinc-100 dark:border-zinc-800 py-8 px-6 mt-10">
      <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-zinc-400">
        <span>© 2026 {PRODUCT_NAME}</span>
        <div className="flex gap-5">
          <Link to="/terms" className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Terms</Link>
          <Link to="/privacy" className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Privacy</Link>
          <Link to="/" className="hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">Home</Link>
        </div>
      </div>
    </footer>
  </div>
);

export default LegalPage;
