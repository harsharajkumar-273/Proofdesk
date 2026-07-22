import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReviewPage from './ReviewPage';

vi.stubGlobal(
  'fetch',
  vi.fn().mockImplementation((url: string) => {
    if (url.includes('/overview.html')) {
      return Promise.resolve({ ok: true });
    }
    if (url.includes('/meta')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ repo: 'demo/course-demo' }),
      });
    }
    return Promise.resolve({ ok: false });
  })
);

describe('ReviewPage Feedback Annotations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders reviewer mode toolbar and feedback comment drawer', async () => {
    render(
      <MemoryRouter initialEntries={['/review/aaaaaaaaaaaaaaaa']}>
        <Routes>
          <Route path="/review/:sessionId" element={<ReviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Reviewer Mode')).toBeInTheDocument();
    });

    expect(screen.getByText('Reviewer Annotations (0)')).toBeInTheDocument();
  });

  it('allows adding and resolving feedback notes', async () => {
    render(
      <MemoryRouter initialEntries={['/review/aaaaaaaaaaaaaaaa']}>
        <Routes>
          <Route path="/review/:sessionId" element={<ReviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Reviewer Mode')).toBeInTheDocument();
    });

    const addBtn = screen.getByText('Add Note');
    fireEvent.click(addBtn);

    const sectionInput = screen.getByPlaceholderText('Section / Line ref...');
    const authorInput = screen.getByPlaceholderText('Your Name...');
    const textInput = screen.getByPlaceholderText('Type feedback, suggestions or correction details...');

    fireEvent.change(sectionInput, { target: { value: 'Section 1.2' } });
    fireEvent.change(authorInput, { target: { value: 'Professor Smith' } });
    fireEvent.change(textInput, { target: { value: 'Please update equation 3.1.' } });

    const saveBtn = screen.getByText('Save Note');
    fireEvent.click(saveBtn);

    expect(screen.getByText('Section 1.2')).toBeInTheDocument();
    expect(screen.getByText('Professor Smith')).toBeInTheDocument();
    expect(screen.getByText('Please update equation 3.1.')).toBeInTheDocument();

    const resolveBtn = screen.getByText('Mark Resolved');
    fireEvent.click(resolveBtn);

    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });
});
