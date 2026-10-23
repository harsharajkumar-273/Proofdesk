import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrefetcher } from './prefetchEditor';

describe('createPrefetcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no requestIdleCallback; the prefetcher falls back to a short timer.
    Reflect.deleteProperty(window, 'requestIdleCallback');
    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, 'connection');
    Reflect.deleteProperty(window, 'requestIdleCallback');
  });

  it('loads in the background, and only once however often it is called', async () => {
    const load = vi.fn(async () => undefined);
    const prefetch = createPrefetcher(load);
    prefetch();
    prefetch();
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    prefetch();
    await vi.advanceTimersByTimeAsync(300);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('uses idle time when the browser offers it', () => {
    const idle = vi.fn((callback: () => void) => callback());
    Object.defineProperty(window, 'requestIdleCallback', { value: idle, configurable: true });
    const load = vi.fn(async () => undefined);
    createPrefetcher(load)();
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the visitor has asked the browser to save data', async () => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    const load = vi.fn(async () => undefined);
    createPrefetcher(load)();
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).not.toHaveBeenCalled();
  });

  it('tries again after a failed load instead of giving up for good', async () => {
    const load = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const prefetch = createPrefetcher(load);
    prefetch();
    await vi.advanceTimersByTimeAsync(300);
    expect(load).toHaveBeenCalledTimes(1);

    prefetch();
    await vi.advanceTimersByTimeAsync(300);
    expect(load).toHaveBeenCalledTimes(2);

    prefetch();
    await vi.advanceTimersByTimeAsync(300);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
