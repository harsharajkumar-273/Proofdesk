import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewWorkflowPanel from './ReviewWorkflowPanel';

const props = {
  activeFilePath: 'course.xml',
  reviewSummary: { filesTracked: 1, approvedFiles: 0, requestedFiles: 0, verifyPreviewFiles: 0, openThreads: 1 },
  reviewEntries: [],
  reviewStatus: 'needs-review' as const,
  reviewNote: '',
  selectedReviewLine: 3,
  reviewCommentDraft: 'Check this proof',
  activeThreads: [],
  setReviewStatus: vi.fn(),
  setReviewNote: vi.fn(),
  setSelectedReviewLine: vi.fn(),
  setReviewCommentDraft: vi.fn(),
  onSaveReviewMarker: vi.fn(),
  onAddReviewComment: vi.fn(),
  onResolveThread: vi.fn(),
  onReopenThread: vi.fn(),
  onOpenFile: vi.fn(),
};

describe('ReviewWorkflowPanel', () => {
  it('labels the line and comment inputs, and lets the comment field shrink in a narrow sidebar', () => {
    render(<ReviewWorkflowPanel {...props} />);
    expect(screen.getByRole('spinbutton', { name: 'Line number' })).toHaveValue(3);
    const comment = screen.getByRole('textbox', { name: 'Comment' });
    expect(comment.className).toMatch(/min-w-0/);
    expect(screen.getByRole('spinbutton', { name: 'Line number' }).className).toMatch(/shrink-0/);
  });

  it('adds a comment from the form', async () => {
    const onAddReviewComment = vi.fn();
    render(<ReviewWorkflowPanel {...props} onAddReviewComment={onAddReviewComment} />);
    await userEvent.click(screen.getByRole('button', { name: /add comment/i }));
    expect(onAddReviewComment).toHaveBeenCalled();
  });

  it('asks the author to open a file before commenting when none is open', () => {
    render(<ReviewWorkflowPanel {...props} activeFilePath={undefined} reviewCommentDraft="" />);
    expect(screen.getByPlaceholderText('Open a file to comment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add comment/i })).toBeDisabled();
  });
});
