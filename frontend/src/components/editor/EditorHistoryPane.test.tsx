import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { EditorHistoryPane } from './EditorHistoryPane';

vi.mock('../../utils/editorApi', () => ({
  requestJson: vi.fn(),
}));

import { requestJson } from '../../utils/editorApi';

describe('EditorHistoryPane', () => {
  const sessionId = 'test-session-id';
  const apiUrl = 'http://localhost:4000';
  const mockOnRollbackSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders commit timeline with draft badges and save draft button', async () => {
    (requestJson as any).mockResolvedValueOnce({
      success: true,
      commits: [
        {
          hash: 'abc123456789',
          shortHash: 'abc1234',
          author: 'Proofdesk Draft Bot',
          date: '2026-07-23',
          subject: 'draft(auto-save): Auto-saved workspace snapshot',
          files: ['main.ptx'],
        },
        {
          hash: 'def987654321',
          shortHash: 'def9876',
          author: 'Author Name',
          date: '2026-07-22',
          subject: 'feat: add initial textbook chapter',
          files: ['chapter1.ptx'],
        },
      ],
    });

    render(
      <EditorHistoryPane
        sessionId={sessionId}
        apiUrl={apiUrl}
        onRollbackSuccess={mockOnRollbackSuccess}
      />
    );

    expect(screen.getByText('Loading commit timeline...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Revision History')).toBeInTheDocument();
      expect(screen.getByText('Auto-Save')).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByText('feat: add initial textbook chapter')).toBeInTheDocument();
    });
  });

  it('invokes draft auto-save endpoint when Save Draft button is clicked', async () => {
    (requestJson as any)
      .mockResolvedValueOnce({
        success: true,
        commits: [],
      })
      .mockResolvedValueOnce({
        success: true,
        created: true,
        message: 'Draft snapshot saved successfully!',
      })
      .mockResolvedValueOnce({
        success: true,
        commits: [
          {
            hash: 'newdraft123',
            shortHash: 'newdraft',
            author: 'Proofdesk Draft Bot',
            date: '2026-07-23',
            subject: 'draft(auto-save): Auto-saved workspace snapshot',
            files: ['index.ptx'],
          },
        ],
      });

    render(
      <EditorHistoryPane
        sessionId={sessionId}
        apiUrl={apiUrl}
        onRollbackSuccess={mockOnRollbackSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Save Draft')).toBeInTheDocument();
    });

    const saveDraftButton = screen.getByText('Save Draft');
    fireEvent.click(saveDraftButton);

    await waitFor(() => {
      expect(requestJson).toHaveBeenCalledWith(
        'http://localhost:4000/workspace/test-session-id/drafts/auto-save',
        { method: 'POST' },
        'Failed to save draft snapshot'
      );
    });
  });
});
