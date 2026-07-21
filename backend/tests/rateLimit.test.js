import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/middleware/rateLimit.ts';

describe('Rate Limiting Middleware', () => {
  it('allows requests within max limit and sets rate limit headers', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 3 });

    const mockReq = { ip: '127.0.0.1', headers: {} };
    const headers = {};
    let nextCalled = false;

    const mockRes = {
      setHeader: (key, val) => {
        headers[key] = val;
      },
    };

    const next = () => {
      nextCalled = true;
    };

    // 1st request
    limiter(mockReq, mockRes, next);
    assert.equal(nextCalled, true);
    assert.equal(headers['X-RateLimit-Limit'], 3);
    assert.equal(headers['X-RateLimit-Remaining'], 2);

    // 2nd request
    nextCalled = false;
    limiter(mockReq, mockRes, next);
    assert.equal(nextCalled, true);
    assert.equal(headers['X-RateLimit-Remaining'], 1);

    // 3rd request
    nextCalled = false;
    limiter(mockReq, mockRes, next);
    assert.equal(nextCalled, true);
    assert.equal(headers['X-RateLimit-Remaining'], 0);
  });

  it('rejects requests exceeding max limit with status 429', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
    const mockReq = { ip: '192.168.1.1', headers: {} };
    const headers = {};
    let statusCode = 0;
    let jsonBody = null;
    let nextCalled = false;

    const mockRes = {
      setHeader: (key, val) => {
        headers[key] = val;
      },
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonBody = data;
          },
        };
      },
    };

    const next = () => {
      nextCalled = true;
    };

    // 1st & 2nd requests (allowed)
    limiter(mockReq, mockRes, next);
    limiter(mockReq, mockRes, next);
    assert.equal(nextCalled, true);

    // 3rd request (exceeds limit)
    nextCalled = false;
    limiter(mockReq, mockRes, next);

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 429);
    assert.equal(headers['X-RateLimit-Remaining'], 0);
    assert.ok(headers['Retry-After'] !== undefined);
    assert.equal(jsonBody.error, 'Too Many Requests');
  });
});
