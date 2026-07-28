import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const { cacheConnection, resetRedisClients } = await import('../src/utils/redisClient.js');

/**
 * Regression tests for the permanently-broken client reported in issue #55.
 *
 * A rejected promise is still a settled promise. Caching one meant every later caller re-awaited
 * the same failure, so a Redis server that happened to be down for the few seconds around startup
 * left the process broken until it was restarted — even once Redis was healthy again.
 *
 * These exercise `cacheConnection` with a fake connect function rather than a real server. That is
 * not only for speed: the node-redis client retries on a backoff, so pointing it at a refused port
 * makes `connect()` hang rather than reject, and there would be nothing to assert on.
 */
describe('redis connection caching (issue #55)', () => {
  /** A slot standing in for one of the module's cached promises. */
  const slot = () => {
    let value = null;
    return {
      read: () => value,
      write: (promise) => {
        value = promise;
      },
      get current() {
        return value;
      },
    };
  };

  beforeEach(() => {
    resetRedisClients();
  });

  it('caches a successful connection so the second caller reuses it', async () => {
    const s = slot();
    let calls = 0;
    const connect = async () => {
      calls += 1;
      return { id: 'client' };
    };

    const first = await cacheConnection(connect, s.read, s.write);
    const second = await cacheConnection(connect, s.read, s.write);

    assert.equal(calls, 1);
    assert.equal(first, second);
  });

  it('clears the slot when the attempt fails', async () => {
    const s = slot();
    await assert.rejects(
      cacheConnection(async () => {
        throw new Error('redis is down');
      }, s.read, s.write)
    );

    assert.equal(s.current, null, 'a failed attempt must not stay cached');
  });

  it('retries on the next call instead of replaying the cached failure', async () => {
    // This is the bug: before the fix, `calls` stayed at 1 and the second caller received the
    // first caller's error.
    const s = slot();
    let calls = 0;
    const connect = async () => {
      calls += 1;
      throw new Error(`attempt ${calls}`);
    };

    const first = await cacheConnection(connect, s.read, s.write).catch((error) => error);
    const second = await cacheConnection(connect, s.read, s.write).catch((error) => error);

    assert.equal(calls, 2, 'the second call did not attempt a fresh connection');
    assert.notEqual(first, second, 'the second call received the cached rejection');
    assert.equal(first.message, 'attempt 1');
    assert.equal(second.message, 'attempt 2');
  });

  it('recovers once the server comes back', async () => {
    const s = slot();
    let up = false;
    const connect = async () => {
      if (!up) throw new Error('redis is down');
      return { id: 'client' };
    };

    await assert.rejects(cacheConnection(connect, s.read, s.write));
    up = true;

    const client = await cacheConnection(connect, s.read, s.write);
    assert.deepEqual(client, { id: 'client' });
    assert.notEqual(s.current, null, 'the recovered connection should now be cached');
  });

  it('still surfaces the original error to the caller that triggered the attempt', async () => {
    // Clearing the slot must not swallow the failure — the caller still needs to know.
    const s = slot();
    await assert.rejects(
      cacheConnection(async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:6379');
      }, s.read, s.write),
      /ECONNREFUSED/
    );
  });

  it('shares one in-flight attempt between concurrent callers', async () => {
    // Two callers arriving before the first connection settles should not open two clients.
    const s = slot();
    let calls = 0;
    const connect = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { id: 'client' };
    };

    const [a, b] = await Promise.all([
      cacheConnection(connect, s.read, s.write),
      cacheConnection(connect, s.read, s.write),
    ]);

    assert.equal(calls, 1);
    assert.equal(a, b);
  });

  it('does not discard a replacement when an older failure settles late', async () => {
    // If the slot is reset while an attempt is in flight, that attempt's failure must not clear
    // whatever took its place.
    const s = slot();
    let releaseFirst;
    const slowFailure = () =>
      new Promise((_resolve, reject) => {
        releaseFirst = () => reject(new Error('late failure'));
      });

    const pending = cacheConnection(slowFailure, s.read, s.write).catch(() => 'failed');

    // Something else replaces the slot before the first attempt settles.
    const replacement = Promise.resolve({ id: 'replacement' });
    s.write(replacement);

    releaseFirst();
    await pending;

    assert.equal(s.current, replacement, 'the late failure cleared a slot it no longer owned');
  });

  it('resetRedisClients clears every cached connection', async () => {
    // Calling it twice must be safe — a shutdown path may not know whether anything connected.
    resetRedisClients();
    resetRedisClients();
  });
});
