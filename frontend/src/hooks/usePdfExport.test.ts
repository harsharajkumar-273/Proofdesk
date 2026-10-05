import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePdfExport } from './usePdfExport';

const setup = (statuses: Array<string | Error>, sessionId: string | null = 'sess-1') => {
  const request = vi.fn(async (pathname: string) => {
    if (pathname.startsWith('/build/pdf-status/')) {
      const next = statuses.shift();
      if (next instanceof Error) throw next;
      return { status: next ?? 'building' };
    }
    return {};
  });
  const hook = renderHook(() =>
    usePdfExport({
      getSessionId: () => sessionId,
      request: request as never,
      apiUrl: 'http://api.test',
      filename: 'book.pdf',
    }),
  );
  return { request, ...hook };
};

describe('usePdfExport', () => {
  let click: ReturnType<typeof vi.spyOn>;
  let downloaded: Array<{ href: string; download: string }>;

  beforeEach(() => {
    vi.useFakeTimers();
    downloaded = [];
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push({ href: this.href, download: this.download });
    });
  });
  afterEach(() => {
    click.mockRestore();
    vi.useRealTimers();
  });

  it('does nothing without a build session', async () => {
    const { result, request } = setup([], null);
    await act(() => result.current.exportPdf());
    expect(request).not.toHaveBeenCalled();
    expect(result.current.pdfBuilding).toBe(false);
  });

  it('polls until ready, then downloads the PDF', async () => {
    const { result, request } = setup(['building', 'ready']);
    await act(() => result.current.exportPdf());
    expect(request).toHaveBeenCalledWith('/build/pdf/sess-1', { method: 'POST' });
    expect(result.current.pdfBuilding).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.pdfBuilding).toBe(true);
    expect(downloaded).toHaveLength(0);

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.pdfBuilding).toBe(false);
    expect(downloaded).toEqual([{ href: 'http://api.test/build/pdf-download/sess-1', download: 'book.pdf' }]);
  });

  it('stops without downloading when no PDF was produced (idle)', async () => {
    const { result } = setup(['idle']);
    await act(() => result.current.exportPdf());
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.pdfBuilding).toBe(false);
    expect(downloaded).toHaveLength(0);
  });

  it('stops when the status request fails', async () => {
    const { result } = setup([new Error('boom')]);
    await act(() => result.current.exportPdf());
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.pdfBuilding).toBe(false);
  });

  it('resets when the initial request fails', async () => {
    const request = vi.fn().mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() =>
      usePdfExport({ getSessionId: () => 's', request, apiUrl: '', filename: 'x.pdf' }),
    );
    await act(() => result.current.exportPdf());
    expect(result.current.pdfBuilding).toBe(false);
  });

  it('ignores a second export while one is in progress', async () => {
    const { result, request } = setup(['building', 'building']);
    await act(() => result.current.exportPdf());
    await act(() => result.current.exportPdf());
    expect(request.mock.calls.filter(([path]) => path === '/build/pdf/sess-1')).toHaveLength(1);
  });

  it('ignores a second click while the initial request is still pending', async () => {
    let release: () => void = () => undefined;
    const request = vi.fn(() => new Promise<unknown>((resolve) => { release = () => resolve({}); }));
    const { result } = renderHook(() =>
      usePdfExport({ getSessionId: () => 's', request: request as never, apiUrl: '', filename: 'x.pdf' }),
    );
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.exportPdf(); });
    await act(() => result.current.exportPdf());
    expect(request).toHaveBeenCalledTimes(1);
    release();
    await act(() => first);
  });

  it('stops polling on unmount', async () => {
    const { result, request, unmount } = setup(['building', 'building', 'ready']);
    await act(() => result.current.exportPdf());
    unmount();
    await vi.advanceTimersByTimeAsync(20000);
    expect(request.mock.calls.filter(([path]) => String(path).startsWith('/build/pdf-status/'))).toHaveLength(0);
    expect(downloaded).toHaveLength(0);
  });
});
