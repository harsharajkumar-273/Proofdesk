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

describe('useBuildErrorExplanation', () => {
  beforeEach(() => requestJson.mockReset());

  it('posts the log with credentials and exposes the explanation', async () => {
    requestJson.mockResolvedValue({ explanation });
    const { result } = renderHook(() => useBuildErrorExplanation('http://api.test'));
    expect(result.current.status).toBe('idle');

    await act(() => result.current.explain('the log'));

    const [url, init] = requestJson.mock.calls[0];
    expect(url).toBe('http://api.test/build/explain-error');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ log: 'the log' });
    expect(result.current.status).toBe('success');
    expect(result.current.explanation).toEqual(explanation);
  });

  it('marks the feature unavailable, without an error, when the server has no AI key', async () => {
    requestJson.mockRejectedValueOnce(new EditorApiError('not enabled', { status: 503, code: 'ai_not_configured' }));
    const { result } = renderHook(() => useBuildErrorExplanation(''));
    await act(() => result.current.explain('log'));
    expect(result.current.unavailable).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).toBe('');
  });

  it.each([
    [429, /too many/i],
    [413, /too large/i],
  ])('shows a specific message for HTTP %i', async (status, pattern) => {
    requestJson.mockRejectedValueOnce(new EditorApiError('raw', { status }));
    const { result } = renderHook(() => useBuildErrorExplanation(''));
    await act(() => result.current.explain('log'));
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(pattern);
  });

  it('uses the server message for other API errors and a generic one otherwise', async () => {
    requestJson.mockRejectedValueOnce(new EditorApiError('The assistant could not explain this build error', { status: 422 }));
    const { result } = renderHook(() => useBuildErrorExplanation(''));
    await act(() => result.current.explain('log'));
    expect(result.current.errorMessage).toBe('The assistant could not explain this build error');

    requestJson.mockRejectedValueOnce(new TypeError('network down'));
    await act(() => result.current.explain('log'));
    expect(result.current.errorMessage).toMatch(/try again/i);
  });

  it('ignores a second request while one is in flight', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    requestJson.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useBuildErrorExplanation(''));
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.explain('log'); });
    expect(result.current.status).toBe('loading');
    await act(() => result.current.explain('log'));
    expect(requestJson).toHaveBeenCalledTimes(1);
    resolve({ explanation });
    await act(() => first);
    expect(result.current.status).toBe('success');
  });

  it('can retry after an error', async () => {
    requestJson.mockRejectedValueOnce(new TypeError('x')).mockResolvedValueOnce({ explanation });
    const { result } = renderHook(() => useBuildErrorExplanation(''));
    await act(() => result.current.explain('log'));
    expect(result.current.status).toBe('error');
    await act(() => result.current.explain('log'));
    expect(result.current.status).toBe('success');
    expect(result.current.errorMessage).toBe('');
  });

  it('does not update state after unmount', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    requestJson.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => useBuildErrorExplanation(''));
    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = result.current.explain('log'); });
    unmount();
    resolve({ explanation });
    await pending;
    expect(result.current.status).toBe('loading');
  });
});
