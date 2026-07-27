import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { onRedisReconnect, notifyRedisReconnect } from '../src/utils/redisClient.js';
import { InProcessBuildQueue, registerMigratedResolver, resolveMigratedJob } from '../src/services/buildQueue.js';

describe('Redis Reconnection & Fallback Queue Task Migration (#5)', () => {
  it('triggers registered reconnection listeners when notifyRedisReconnect is invoked', () => {
    let reconnected = false;
    const unsubscribe = onRedisReconnect(() => {
      reconnected = true;
    });

    notifyRedisReconnect();
    assert.equal(reconnected, true);
    unsubscribe();
  });

  it('migrates outstanding local fallback jobs to BullMQ target queue upon Redis reconnection', async () => {
    const testQueue = new InProcessBuildQueue();
    const migratedJobs = [];
    const mockBullQueue = {
      add: async (name, data, opts) => {
        migratedJobs.push({ name, data, opts });
        return { id: `bull_${data.migrationId}` };
      },
    };

    // Add jobs to local queue instance
    let resolvedValue1 = null;
    let resolvedValue2 = null;

    // Block local processing by marking queue as running
    testQueue.running = true;

    const jobPromise1 = testQueue.add('sess_1', { xmlId: 'doc1' }).then((res) => {
      resolvedValue1 = res;
    });

    const jobPromise2 = testQueue.add('sess_2', { xmlId: 'doc2' }).then((res) => {
      resolvedValue2 = res;
    });

    // Check pending local queue count
    assert.equal(testQueue.pendingCount, 2);

    // Perform migration to mock BullMQ queue
    const count = await testQueue.migrateToRedisQueue(mockBullQueue);
    assert.equal(count, 2);
    assert.equal(migratedJobs.length, 2);

    // Verify migrated job structure
    const migrated1 = migratedJobs.find((j) => j.data.sessionId === 'sess_1');
    assert.ok(migrated1);
    assert.equal(migrated1.name, 'compile');
    assert.equal(migrated1.data.sessionId, 'sess_1');

    // Simulate BullMQ job completion resolving the migrated promises
    resolveMigratedJob(`bull_${migrated1.data.migrationId}`, { success: true, migrated: true });
    await jobPromise1;
    assert.deepEqual(resolvedValue1, { success: true, migrated: true });

    const migrated2 = migratedJobs.find((j) => j.data.sessionId === 'sess_2');
    assert.ok(migrated2);
    resolveMigratedJob(`bull_${migrated2.data.migrationId}`, { success: true, migrated: true });
    await jobPromise2;
    assert.deepEqual(resolvedValue2, { success: true, migrated: true });
  });
});
