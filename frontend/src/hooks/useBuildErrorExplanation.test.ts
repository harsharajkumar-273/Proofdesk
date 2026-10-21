import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EditorApiError } from '../utils/editorApi';
import { useBuildErrorExplanation } from './useBuildErrorExplanation';

const requestJson = vi.hoisted(() => vi.fn());
vi.mock('../utils/editorApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/editorApi')>()),
  requestJson,
}));

const explanation = {
  summary: 'A tag is not closed.',
  likelyCause: 'Missing </theorem>.',
  fixSteps: ['Add the closing tag'],
  location: 'ch1.xml:42',
  confidence: 'high' as const,
};

const SESSION = '0123456789abcdef';

describe('useBuildErrorExplanation', () => {
  beforeEach(() => requestJson.mockReset());

  it('asks the server about the session, sending no log, and exposes the explanation', async () => {
    requestJson.mockResolvedValue({ explanation, id: 'feedfacefeedface' });
    const { result } = renderHook(() => useBuildErrorExplanation('http://api.test', SESSION));
    expect(result.current.status).toBe('idle');

    await act(() => result.current.explain());

    const [url, init] = requestJson.mock.calls[0];
    expect(url).toBe(`http://api.test/build/explain-error/${SESSION}`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({});
    expect(result.current.status).toBe('success');
    expect(result.current.explanation).toEqual(explanation);
    expect(result.current.canSendFeedback).toBe(true);
  });

  it('marks the feature unavailable, without an error, when the server has no AI key', async () => {
    requestJson.mockRejectedValueOnce(new EditorApiError('not enabled', { status: 503, code: 'ai_not_configured' }));
    const { result } = renderHook(() => useBuildErrorExplanation('', SESSION));
    await act(() => result.current.explain());
    expect(result.current.unavailable).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).toBe('');
  });

  it.each([
    [new EditorApiError('raw', { status: 429 }), /too many/i],
    [new EditorApiError('raw', { status: 404, code: 'build_log_not_found' }), /run the build again/i],
    [new EditorApiError('raw', { status: 409, code: 'build_not_failed' }), /did not fail/i],
  ])('shows a specific message for %s', async (error, pattern) => {
    requestJson.mockRejectedValueOnce(error);
    const { result } = renderHook(() => useBuildErrorExplanation('', SESSION));
    await act(() => result.current.explain());
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(pattern);
  });

  it('uses the server message for other API errors and a generic one otherwise', async () => {
    requestJson.mockRejectedValueOnce(new EditorApiError('The assistant could not explain this build error', { status: 422 }));
    const { result } = renderHook(() => useBuildErrorExplanation('', SESSION));
    await act(() => result.current.explain());
    expect(result.current.errorMessage).toBe('The assistant could not explain this build error');

    requestJson.mockRejectedValueOnce(new TypeError('network down'));
    await act(() => result.current.explain());
    expect(result.current.errorMessage).toMatch(/try again/i);
  });

  it('ignores a second request while one is in flight', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    requestJson.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useBuildErrorExplanation('', SESSION));
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.explain(); });
    expect(result.current.status).toBe('loading');
    await act(() => result.current.explain());
    expect(requestJson).toHaveBeenCalledTimes(1);
    resolve({ explanation });
    await act(() => first);
    expect(result.current.status).toBe('success');
  });

  it('can retry after an error', async () => {
    requestJson.mockRejectedValueOnce(new TypeError('x')).mockResolvedValueOnce({ explanation });
    const { result } = renderHook(() => useBuildErrorExplanation('', SESSION));
    await act(() => result.current.explain());
    expect(result.current.status).toBe('error');
    await act(() => result.current.explain());
    expect(result.current.status).toBe('success');
    expect(result.current.errorMessage).toBe('');
  });

  it('does not update state after unmount', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    requestJson.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => useBuildErrorExplanation('', SESSION));
    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = result.current.explain(); });
    unmount();
    resolve({ explanation });
    await pending;
    expect(result.current.status).toBe('loading');
  });

  it('sends feedback once, against the explanation id, and keeps the vote if sending fails', async () => {
    requestJson.mockResolvedValueOnce({ explanation, id: 'feedfacefeedface' }).mockRejectedValueOnce(new TypeError('offline'));
    const { result } = renderHook(() => useBuildErrorExplanation('http://api.test', SESSION));
    await act(() => result.current.explain());

    await act(() => result.current.sendFeedback(false));
    await act(() => result.current.sendFeedback(true));

    expect(requestJson).toHaveBeenCalledTimes(2);
    const [url, init] = requestJson.mock.calls[1];
    expect(url).toBe(`http://api.test/build/explain-error/${SESSION}/feedback`);
    expect(JSON.parse(init.body)).toEqual({ id: 'feedfacefeedface', helpful: false });
    expect(result.current.feedback).toBe('not_helpful');
  });

  it('cannot send feedback for an answer without an id', async () => {
    requestJson.mockResolvedValueOnce({ explanation });
    const { result } = renderHook(() => useBuildErrorExplanation('', SESSION));
    await act(() => result.current.explain());
    expect(result.current.canSendFeedback).toBe(false);
    await act(() => result.current.sendFeedback(true));
    expect(requestJson).toHaveBeenCalledTimes(1);
  });
});
