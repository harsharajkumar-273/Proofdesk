import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/utils/rateLimiter.ts';

describe('createRateLimiter', () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, ENABLE_LOCAL_TEST_MODE: process.env.ENABLE_LOCAL_TEST_MODE };

  afterEach(() => {
    process.env.NODE_ENV = previous.NODE_ENV;
    if (previous.ENABLE_LOCAL_TEST_MODE === undefined) delete process.env.ENABLE_LOCAL_TEST_MODE;
    else process.env.ENABLE_LOCAL_TEST_MODE = previous.ENABLE_LOCAL_TEST_MODE;
  });

  it('is lifted in local test mode for ordinary limiters', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_LOCAL_TEST_MODE = 'true';
    const allowed = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    assert.deepEqual([allowed('k'), allowed('k'), allowed('k')], [true, true, true]);
  });

  it('stays enforced in local test mode when it caps spending', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_LOCAL_TEST_MODE = 'true';
    const allowed = createRateLimiter({ windowMs: 60_000, maxRequests: 2, capsSpending: true });
    assert.deepEqual([allowed('k'), allowed('k'), allowed('k'), allowed('other')], [true, true, false, true]);
  });

  it('is lifted for the test suite even when it caps spending', () => {
    process.env.NODE_ENV = 'test';
    const allowed = createRateLimiter({ windowMs: 60_000, maxRequests: 1, capsSpending: true });
    assert.deepEqual([allowed('k'), allowed('k')], [true, true]);
  });
});
