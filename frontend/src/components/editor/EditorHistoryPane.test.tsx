import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { EditorHistoryPane } from './EditorHistoryPane';
import * as editorApi from '../../utils/editorApi';

vi.mock('../../utils/editorApi', () => ({
  requestJson: vi.fn(),
}));

describe('EditorHistoryPane Component (#14)', () => {
  const mockOnRollbackSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders revision timeline with commits', async () => {
    vi.mocked(editorApi.requestJson).mockResolvedValueOnce({
      success: true,
      commits: [
        {
          hash: 'abc123456789',
          shortHash: 'abc1234',
          author: 'Harsha',
          date: '2026-07-27',
          subject: 'feat: update vectors chapter',
          files: ['vectors.xml'],
        },
      ],
    });

    render(
      <EditorHistoryPane
        sessionId="sess_123"
        apiUrl="http://localhost:4000"
        onRollbackSuccess={mockOnRollbackSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('feat: update vectors chapter')).toBeInTheDocument();
    });
  });

  it('truncates large diff files exceeding 500 lines and displays expansion controls', async () => {
    vi.mocked(editorApi.requestJson)
      .mockResolvedValueOnce({
        success: true,
        commits: [
          {
            hash: 'abc123456789',
            shortHash: 'abc1234',
            author: 'Harsha',
            date: '2026-07-27',
            subject: 'refactor: large textbook update',
            files: ['textbook.xml'],
          },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        diff: Array.from({ length: 1200 }, (_, i) => `+ line ${i + 1}`).join('\n'),
      });

    render(
      <EditorHistoryPane
        sessionId="sess_123"
        apiUrl="http://localhost:4000"
        onRollbackSuccess={mockOnRollbackSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('refactor: large textbook update')).toBeInTheDocument();
    });

    // Expand commit file list
    fireEvent.click(screen.getByText('refactor: large textbook update'));

    await waitFor(() => {
      expect(screen.getByTitle('Inspect Changes')).toBeInTheDocument();
    });

    // Open diff modal
    fireEvent.click(screen.getByTitle('Inspect Changes'));

    await waitFor(() => {
      expect(screen.getByText(/Showing initial/i)).toBeInTheDocument();
    });

    expect(screen.getByText('1200')).toBeInTheDocument();
    expect(screen.getByText('Show Next 500 Lines')).toBeInTheDocument();

    // Click Show Next 500 Lines
    fireEvent.click(screen.getByText('Show Next 500 Lines'));

    await waitFor(() => {
      expect(screen.getByText('1000')).toBeInTheDocument();
    });

    // Click Show All
    fireEvent.click(screen.getByText(/Show All/i));
    expect(screen.queryByText(/Showing initial/i)).not.toBeInTheDocument();
  });
});
