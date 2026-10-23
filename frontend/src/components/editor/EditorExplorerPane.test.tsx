import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditorExplorerPane from './EditorExplorerPane';

const props = {
  activeTabId: null,
  autoCompile: true,
  compilationMode: 'repository' as const,
  expandedFolders: new Set<string>(),
  fileTree: [
    { name: 'course.xml', path: 'course.xml', type: 'file' as const },
    { name: 'images', path: 'images', type: 'dir' as const },
  ],
  folderContents: {},
  loading: false,
  loadingFolders: new Set<string>(),
  recentFiles: [{ path: 'course.xml', name: 'course.xml', openedAt: new Date(1_700_000_000_000).toISOString() }],
  reviewMarkers: {},
  openReviewThreads: 0,
  onOpenReview: vi.fn(),
  setAutoCompile: vi.fn(),
  setCompilationMode: vi.fn(),
  tabs: [],
  onOpenFile: vi.fn(),
  onRefresh: vi.fn(),
  onToggleFolder: vi.fn(),
};

describe('EditorExplorerPane', () => {
  it('is just the files: no review dashboard or duplicate search crowding the tree', () => {
    const { container } = render(<EditorExplorerPane {...props} />);
    expect(container.querySelector('[data-file-path="course.xml"]')).not.toBeNull();
    expect(screen.queryByText(/review dashboard|inline comments|review workflow/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/search all files/i)).toBeNull();
  });

  it('opens a file when it is clicked', async () => {
    const onOpenFile = vi.fn();
    const { container } = render(<EditorExplorerPane {...props} onOpenFile={onOpenFile} />);
    await userEvent.click(container.querySelector('[data-file-path="course.xml"]') as HTMLElement);
    expect(onOpenFile).toHaveBeenCalledWith('course.xml');
  });

  it('shows recent files with their real case, not capitals', () => {
    render(<EditorExplorerPane {...props} />);
    const path = screen.getAllByText('course.xml').find((el) => el.className.includes('text-[10px]'));
    expect(path).toBeDefined();
    expect(path?.className).not.toMatch(/uppercase/);
  });

  it('points to the Review tab only when there are open threads', async () => {
    const onOpenReview = vi.fn();
    const { rerender } = render(<EditorExplorerPane {...props} onOpenReview={onOpenReview} />);
    expect(screen.queryByRole('button', { name: /open review/i })).toBeNull();

    rerender(<EditorExplorerPane {...props} openReviewThreads={1} onOpenReview={onOpenReview} />);
    await userEvent.click(screen.getByRole('button', { name: '1 open review thread' }));
    expect(onOpenReview).toHaveBeenCalledTimes(1);

    rerender(<EditorExplorerPane {...props} openReviewThreads={3} onOpenReview={onOpenReview} />);
    expect(screen.getByRole('button', { name: '3 open review threads' })).toBeInTheDocument();
  });

  it('toggles auto-compile and the build mode', async () => {
    const setAutoCompile = vi.fn();
    const setCompilationMode = vi.fn();
    render(<EditorExplorerPane {...props} setAutoCompile={setAutoCompile} setCompilationMode={setCompilationMode} />);
    await userEvent.click(screen.getByText('Auto-compile'));
    expect(setAutoCompile).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'File' }));
    expect(setCompilationMode).toHaveBeenCalledWith('file');
  });
});
