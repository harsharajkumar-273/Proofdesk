import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import BuildLogPanel from './BuildLogPanel';

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

describe('BuildLogPanel', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    // jsdom does not implement scrollIntoView, which the panel uses to follow the log.
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderPanel = () => render(<BuildLogPanel sessionId="abc" apiUrl="http://api.test" onComplete={vi.fn()} onClose={vi.fn()} />);

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

  it('still allows an explanation when the failure carries only result text and no streamed lines', () => {
    renderPanel();
    finishBuild({ success: false, error: 'Docker unavailable' });
    expect(screen.getByRole('button', { name: /explain this error/i })).toBeEnabled();
  });
});
