import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditorSearchPane } from './EditorSearchPane';

describe('EditorSearchPane Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders search and replace input fields', () => {
    render(
      <EditorSearchPane
        activeTabId={null}
        searchQuery=""
        setSearchQuery={vi.fn()}
        tabs={[]}
        onOpenFile={vi.fn()}
        sessionId="test-session"
      />
    );

    expect(screen.getByText('SEARCH & REPLACE')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search across all files...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Replace with...')).toBeInTheDocument();
  });

  it('executes replace all fetch request when Replace All button is clicked', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/search')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  path: 'chapter1.xml',
                  matches: [{ line: 5, text: 'oldTerm content' }],
                },
              ],
            }),
        });
      }
      if (url.includes('/replace')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              filesModified: 1,
              totalReplacements: 1,
              modifiedFiles: ['chapter1.xml'],
            }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    global.fetch = fetchMock;

    render(
      <EditorSearchPane
        activeTabId={null}
        searchQuery="oldTerm"
        setSearchQuery={vi.fn()}
        tabs={[]}
        onOpenFile={vi.fn()}
        sessionId="test-session"
        apiUrl="http://localhost:4000"
      />
    );

    // Wait for initial search debounce and results to load
    await waitFor(() => {
      expect(screen.getByText(/1 match in 1 file/i)).toBeInTheDocument();
    });

    const replaceInput = screen.getByPlaceholderText('Replace with...');
    fireEvent.change(replaceInput, { target: { value: 'newTerm' } });

    const replaceBtn = screen.getByText('Replace All');
    expect(replaceBtn).not.toBeDisabled();
    fireEvent.click(replaceBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4000/workspace/test-session/replace',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            query: 'oldTerm',
            replacement: 'newTerm',
            matchCase: false,
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Replaced 1 occurrence across 1 file/i)).toBeInTheDocument();
    });
  });
});
