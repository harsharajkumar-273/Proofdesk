import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  USER_MAX_CALLS,
  USER_WINDOW_MS,
  createMemoryCounterStore,
  getDailyLimit,
  reserveModelCall,
} from '../src/services/aiUsageBudget.ts';

describe('reserveModelCall', () => {
  const setup = (dailyLimit = 100) => {
    let time = Date.UTC(2026, 9, 21, 12, 0, 0);
    const store = createMemoryCounterStore(() => time);
    return {
      reserve: (user) => reserveModelCall(user, { store, now: () => time, dailyLimit }),
      advance: (ms) => { time += ms; },
    };
  };

  it('allows each user a fixed number of calls per window, then resets', async () => {
    const { reserve, advance } = setup();
    for (let i = 0; i < USER_MAX_CALLS; i += 1) assert.equal(await reserve('ada'), 'ok');
    assert.equal(await reserve('ada'), 'user_limit');
    assert.equal(await reserve('bob'), 'ok');
    advance(USER_WINDOW_MS);
    assert.equal(await reserve('ada'), 'ok');
  });

  it('caps calls across all users per UTC day, without counting refused user calls', async () => {
    const { reserve, advance } = setup(3);
    for (let i = 0; i < USER_MAX_CALLS + 2; i += 1) await reserve('ada');
    // ada was refused past her own limit; only her 10 allowed attempts reached the day count
    assert.equal(await reserve('bob'), 'daily_limit');
    advance(24 * 60 * 60_000);
    assert.equal(await reserve('bob'), 'ok');
  });

  it('turns the daily cap off at zero', async () => {
    const { reserve } = setup(0);
    for (let i = 0; i < USER_MAX_CALLS; i += 1) assert.equal(await reserve(`user-${i}`), 'ok');
  });

  it('keeps limiting from memory when the shared counter store fails', async () => {
    const failing = { increment: async () => { throw new Error('redis down'); } };
    const verdicts = [];
    for (let i = 0; i < USER_MAX_CALLS + 1; i += 1) {
      verdicts.push(await reserveModelCall('carol-fallback', { store: failing, dailyLimit: 0 }));
    }
    assert.equal(verdicts.at(-1), 'user_limit');
  });
});

describe('getDailyLimit', () => {
  it('reads PROOFDESK_AI_DAILY_LIMIT with a default', () => {
    assert.equal(getDailyLimit({}), 500);
    assert.equal(getDailyLimit({ PROOFDESK_AI_DAILY_LIMIT: '40' }), 40);
    assert.equal(getDailyLimit({ PROOFDESK_AI_DAILY_LIMIT: '0' }), 0);
    assert.equal(getDailyLimit({ PROOFDESK_AI_DAILY_LIMIT: 'lots' }), 500);
    assert.equal(getDailyLimit({ PROOFDESK_AI_DAILY_LIMIT: '-5' }), 500);
  });
});
