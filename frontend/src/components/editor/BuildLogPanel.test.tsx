import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorApiError } from '../../utils/editorApi';
import BuildLogPanel from './BuildLogPanel';

const requestJson = vi.hoisted(() => vi.fn());
vi.mock('../../utils/editorApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/editorApi')>()),
  requestJson,
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, (event: MessageEvent) => void> = {};
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners[type] = listener;
  }
  close() {}
}

const finishBuild = (result: Record<string, unknown>, lines: string[] = []) => {
  const source = FakeEventSource.instances[0];
  act(() => {
    lines.forEach((line) =>
      source.onmessage?.({ data: JSON.stringify({ line, stream: 'stderr' }) } as MessageEvent),
    );
    source.listeners.done({ data: JSON.stringify(result) } as MessageEvent);
  });
};

const explanation = {
  summary: 'A tag is not closed.',
  likelyCause: 'The <p> on line 40 never closes.',
  fixSteps: ['Add </p>'],
  location: 'source/ch1.xml:40',
  confidence: 'high' as const,
};

describe('BuildLogPanel', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    requestJson.mockReset();
    vi.stubGlobal('EventSource', FakeEventSource);
    // jsdom does not implement scrollIntoView, which the panel uses to follow the log.
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderPanel = (props: Partial<React.ComponentProps<typeof BuildLogPanel>> = {}) =>
    render(<BuildLogPanel sessionId="0123456789abcdef" apiUrl="http://api.test" onComplete={vi.fn()} onClose={vi.fn()} {...props} />);

  it('offers the AI explanation only after a build has failed', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /explain this error/i })).toBeNull();

    finishBuild({ success: false, error: 'Build failed' }, ['ch1.xml:42: tag mismatch']);

    expect(screen.getByText('Build failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explain this error/i })).toBeEnabled();
  });

  it('does not offer it after a successful build', () => {
    renderPanel();
    finishBuild({ success: true });
    expect(screen.getByText('Build complete')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /explain this error/i })).toBeNull();
  });

  it('shows the keyword hint straight away, before any AI request', () => {
    renderPanel();
    finishBuild({ success: false, advice: 'Check the recent XML or PreTeXt edits first.' });
    expect(screen.getByText('Check the recent XML or PreTeXt edits first.')).toBeInTheDocument();
    expect(requestJson).not.toHaveBeenCalled();
  });

  it('puts the explanation in place of the log, with a way back to the log', async () => {
    requestJson.mockResolvedValue({ explanation, id: 'feedfacefeedface' });
    renderPanel();
    finishBuild({ success: false }, ['source/ch1.xml:42: tag mismatch']);

    await userEvent.click(screen.getByRole('button', { name: /explain this error/i }));
    expect(await screen.findByText('A tag is not closed.')).toBeInTheDocument();
    expect(screen.queryByText('source/ch1.xml:42: tag mismatch')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /show build log/i }));
    expect(screen.getByText('source/ch1.xml:42: tag mismatch')).toBeInTheDocument();
    expect(screen.queryByText('A tag is not closed.')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /show explanation/i }));
    expect(screen.getByText('A tag is not closed.')).toBeInTheDocument();
  });

  it('opens the location in the editor and closes the panel', async () => {
    requestJson.mockResolvedValue({ explanation, id: 'feedfacefeedface' });
    const onOpenLocation = vi.fn();
    const onClose = vi.fn();
    renderPanel({ onOpenLocation, onClose });
    finishBuild({ success: false }, ['boom']);

    await userEvent.click(screen.getByRole('button', { name: /explain this error/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'source/ch1.xml:40' }));

    expect(onOpenLocation).toHaveBeenCalledWith('source/ch1.xml', 40);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an alert and a retry button when the request fails', async () => {
    requestJson.mockRejectedValueOnce(new EditorApiError('x', { status: 429 }));
    renderPanel();
    finishBuild({ success: false }, ['boom']);
    await userEvent.click(screen.getByRole('button', { name: /explain this error/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/too many/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });

  it('hides the AI button but keeps the hint once the server reports AI is not configured', async () => {
    requestJson.mockRejectedValueOnce(new EditorApiError('off', { status: 503, code: 'ai_not_configured' }));
    renderPanel();
    finishBuild({ success: false, advice: 'A hint.' }, ['boom']);
    await userEvent.click(screen.getByRole('button', { name: /explain this error/i }));
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: /explain this error/i })).toBeNull());
    expect(screen.getByText('A hint.')).toBeInTheDocument();
  });
});
