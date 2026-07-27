import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditorImportPane from './EditorImportPane';

/**
 * Behavioural tests for the import pane.
 *
 * The drop zone previously advertised drag-and-drop in its copy while having
 * no drag handlers at all, and the conversion calls omitted `credentials`,
 * which meant the cookie-authenticated backend rejected them with 401. Both
 * are regressions worth locking down, so these tests assert the observable
 * behaviour rather than implementation details.
 */

const makeFile = (name: string, type: string, size: number): File => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size, configurable: true });
  return file;
};

/** Minimal DataTransfer stand-in; jsdom does not implement the real one. */
const dataTransferWith = (files: File[]) => ({
  files,
  items: files.map((f) => ({ kind: 'file', getAsFile: () => f })),
  types: ['Files'],
  dropEffect: 'none',
});

const defaultProps = {
  sessionId: 'session-1',
  apiUrl: 'http://localhost:4000',
  onInsertAtCursor: vi.fn(),
  onCreateNewFile: vi.fn(async () => {}),
  activeTabOpen: true,
};

/**
 * Renders the pane and lets the initial `/import/config` request settle.
 * Without this the config response resolves after a synchronous test body has
 * finished, producing an "update was not wrapped in act(...)" warning.
 */
const renderSettled = async () => {
  const result = render(<EditorImportPane {...defaultProps} />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await screen.findByText('Import PDF / LaTeX');
  return result;
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ success: true, mathPixConfigured: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('EditorImportPane — authentication', () => {
  it('sends credentials on the config request so the session cookie reaches the backend', async () => {
    await renderSettled();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/import/config');
    expect(init).toMatchObject({ credentials: 'include' });
  });

  it('does not send a hardcoded bearer token', async () => {
    await renderSettled();

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(JSON.stringify(headers)).not.toContain('local-test');
  });

  it('sends credentials when converting pasted LaTeX', async () => {
    await renderSettled();

    fireEvent.click(screen.getByText('Paste LaTeX'));
    fireEvent.change(screen.getByLabelText('LaTeX or Markdown source'), {
      target: { value: 'Let $x$ be a vector.' },
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, pretext: '<p>Converted</p>' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    fireEvent.click(screen.getByText('Convert Text'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/import/text'));
      expect(call).toBeTruthy();
      expect(call?.[1]).toMatchObject({ credentials: 'include' });
    });
  });
});

describe('EditorImportPane — drag and drop', () => {
  it('accepts a dropped PDF and shows its name', async () => {
    await renderSettled();
    const zone = screen.getByLabelText('Select or drop a PDF document to import');

    const pdf = makeFile('chapter-1.pdf', 'application/pdf', 2048);
    fireEvent.drop(zone, { dataTransfer: dataTransferWith([pdf]) });

    expect(await screen.findByText(/chapter-1\.pdf/)).toBeInTheDocument();
  });

  it('shows the file size alongside the name', async () => {
    await renderSettled();
    const zone = screen.getByLabelText('Select or drop a PDF document to import');

    fireEvent.drop(zone, {
      dataTransfer: dataTransferWith([makeFile('big.pdf', 'application/pdf', 2 * 1024 * 1024)]),
    });

    expect(await screen.findByText(/2\.0 MB/)).toBeInTheDocument();
  });

  it('highlights the zone while a drag is over it', async () => {
    await renderSettled();
    const zone = screen.getByLabelText('Select or drop a PDF document to import');

    fireEvent.dragEnter(zone, { dataTransfer: dataTransferWith([]) });
    expect(screen.getByText('Drop the PDF to import it')).toBeInTheDocument();

    fireEvent.dragLeave(zone, { dataTransfer: dataTransferWith([]) });
    expect(screen.queryByText('Drop the PDF to import it')).not.toBeInTheDocument();
  });

  it('stays highlighted when dragging across child elements', async () => {
    await renderSettled();
    const zone = screen.getByLabelText('Select or drop a PDF document to import');

    // Enter parent, then a child: two enters, one leave must not clear it.
    fireEvent.dragEnter(zone, { dataTransfer: dataTransferWith([]) });
    fireEvent.dragEnter(zone, { dataTransfer: dataTransferWith([]) });
    fireEvent.dragLeave(zone, { dataTransfer: dataTransferWith([]) });

    expect(screen.getByText('Drop the PDF to import it')).toBeInTheDocument();
  });

  it('rejects a dropped non-PDF with a readable message', async () => {
    await renderSettled();
    const zone = screen.getByLabelText('Select or drop a PDF document to import');

    fireEvent.drop(zone, {
      dataTransfer: dataTransferWith([makeFile('notes.txt', 'text/plain', 100)]),
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('not a PDF');
  });

  it('rejects a dropped file over the 15 MB backend limit before uploading', async () => {
    await renderSettled();
    const zone = screen.getByLabelText('Select or drop a PDF document to import');

    fireEvent.drop(zone, {
      dataTransfer: dataTransferWith([
        makeFile('huge.pdf', 'application/pdf', 16 * 1024 * 1024),
      ]),
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('maximum upload size');

    // Crucially, no upload was attempted.
    const uploadCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/import/pdf'));
    expect(uploadCall).toBeUndefined();
  });
});

describe('EditorImportPane — diff preview', () => {
  const convertLatex = async (source: string, pretext: string) => {
    await renderSettled();

    fireEvent.click(screen.getByText('Paste LaTeX'));
    fireEvent.change(screen.getByLabelText('LaTeX or Markdown source'), {
      target: { value: source },
    });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, pretext }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    fireEvent.click(screen.getByText('Convert Text'));
  };

  it('renders a diff summary after a successful conversion', async () => {
    await convertLatex('one\ntwo', '<p>one</p>\n<p>two</p>');
    expect(await screen.findByText(/added/)).toBeInTheDocument();
  });

  it('offers a toggle between diff and raw views', async () => {
    await convertLatex('one', '<p>one</p>');
    expect(await screen.findByTitle('Show as a changeset')).toBeInTheDocument();
    expect(screen.getByTitle('Show raw XML')).toBeInTheDocument();
  });

  it('shows the raw XML when the raw view is selected', async () => {
    await convertLatex('one', '<p>converted output</p>');
    fireEvent.click(await screen.findByTitle('Show raw XML'));

    const raw = screen.getByLabelText('Converted PreTeXt XML') as HTMLTextAreaElement;
    expect(raw.value).toBe('<p>converted output</p>');
  });
});

describe('EditorImportPane — error handling', () => {
  it('surfaces a readable message when the server returns non-JSON', async () => {
    await renderSettled();

    fireEvent.click(screen.getByText('Paste LaTeX'));
    fireEvent.change(screen.getByLabelText('LaTeX or Markdown source'), {
      target: { value: 'content' },
    });

    // Multer size rejections produce Express's HTML error page, not JSON.
    fetchMock.mockResolvedValueOnce(
      new Response('<!DOCTYPE html><html><body><pre>File too large</pre></body></html>', {
        status: 413,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    fireEvent.click(screen.getByText('Convert Text'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('File too large');
    expect(alert.textContent).not.toContain('DOCTYPE');
  });

  it('reports the status code when the error body is empty', async () => {
    await renderSettled();

    fireEvent.click(screen.getByText('Paste LaTeX'));
    fireEvent.change(screen.getByLabelText('LaTeX or Markdown source'), {
      target: { value: 'content' },
    });

    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    fireEvent.click(screen.getByText('Convert Text'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('401');
  });
});
