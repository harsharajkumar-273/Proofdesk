import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mock env variables before importing modules
process.env.NODE_ENV = 'test';

const { pushBuildJob } = await import('../src/services/buildQueue.js');

describe('Distributed Build Queue Service', () => {
  it('returns true for pushBuildJob when falling back to in-process queue', async () => {
    // Under test environment, PROOFDESK_SHARED_STATE_BACKEND defaults to filesystem (not redis)
    const result = await pushBuildJob('test-session-id', { xmlId: null });
    assert.equal(result, true);
  });
});
