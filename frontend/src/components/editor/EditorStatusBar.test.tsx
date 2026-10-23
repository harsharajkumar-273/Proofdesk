import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditorStatusBar from './EditorStatusBar';

const base = {
  compilationMode: 'repository' as const,
  autoCompile: true,
  repoCompilationResult: { success: true },
  openTabsCount: 2,
  unsavedCount: 0,
  userLogin: 'Ada',
};

describe('EditorStatusBar', () => {
  it('reads as sentences, not shouted labels', () => {
    render(<EditorStatusBar {...base} />);
    expect(screen.getByText('Repository build')).toBeInTheDocument();
    expect(screen.getByText('Auto-compile')).toBeInTheDocument();
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
    expect(screen.getByText('Open tabs')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(document.querySelector('footer')?.className).not.toMatch(/uppercase/);
  });

  it('reflects a failed build, single-file mode and disabled auto-compile', () => {
    render(<EditorStatusBar {...base} compilationMode="file" autoCompile={false} repoCompilationResult={{ success: false }} />);
    expect(screen.getByText('Single file')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('opens the Problems panel from the error count', async () => {
    const onOpenProblems = vi.fn();
    render(<EditorStatusBar {...base} errorCount={2} onOpenProblems={onOpenProblems} />);
    await userEvent.click(screen.getByTitle('Open Problems panel'));
    expect(onOpenProblems).toHaveBeenCalled();
  });
});
