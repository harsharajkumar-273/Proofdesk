import { createHash } from 'crypto';
import { getRedisClient, isRedisSharedStateEnabled } from '../utils/redisClient.js';
import logger from '../utils/logger.js';

/**
 * Spending limits for paid AI calls: a per-user window and a server-wide daily
 * total. With shared Redis state the counts are shared by every backend
 * instance; otherwise they live in this process.
 *
 * Fixed windows are used rather than sliding ones so a Redis count is one
 * INCR per call.
 */

export const USER_WINDOW_MS = 10 * 60_000;
export const USER_MAX_CALLS = 10;
const DEFAULT_DAILY_LIMIT = 500;

export type BudgetVerdict = 'ok' | 'user_limit' | 'daily_limit';

/** Server-wide model calls per UTC day. PROOFDESK_AI_DAILY_LIMIT=0 turns the cap off. */
export const getDailyLimit = (env: NodeJS.ProcessEnv = process.env): number => {
  const parsed = Number.parseInt(String(env.PROOFDESK_AI_DAILY_LIMIT ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_LIMIT;
};

export interface CounterStore {
  /** Adds one to `key` and returns the new count; the key expires after `ttlSeconds`. */
  increment(key: string, ttlSeconds: number): Promise<number>;
}

export const createMemoryCounterStore = (now: () => number = Date.now): CounterStore => {
  const counts = new Map<string, { value: number; expiresAt: number }>();
  return {
    async increment(key, ttlSeconds) {
      const time = now();
      if (counts.size > 5000) {
        for (const [k, entry] of counts) if (entry.expiresAt <= time) counts.delete(k);
      }
      const current = counts.get(key);
      const value = current && current.expiresAt > time ? current.value + 1 : 1;
      counts.set(key, { value, expiresAt: current && current.expiresAt > time ? current.expiresAt : time + ttlSeconds * 1000 });
      return value;
    },
  };
};

const redisCounterStore: CounterStore = {
  async increment(key, ttlSeconds) {
    const redis = await getRedisClient();
    const value = Number(await redis.incr(key));
    if (value === 1) await redis.expire(key, ttlSeconds);
    return value;
  },
};

const memoryStore = createMemoryCounterStore();

const utcDay = (time: number): string => new Date(time).toISOString().slice(0, 10);
// Keys hold a hash, not the raw login or token, so Redis never stores a credential.
const userKeyPart = (userKey: string): string => createHash('sha256').update(userKey).digest('hex').slice(0, 24);

/**
 * Records one model call for `userKey` and says whether it is within budget.
 * A call refused for the user's window does not count against the day.
 */
export const reserveModelCall = async (
  userKey: string,
  {
    store,
    now = Date.now,
    dailyLimit = getDailyLimit(),
  }: { store?: CounterStore; now?: () => number; dailyLimit?: number } = {},
): Promise<BudgetVerdict> => {
  let counters = store ?? (isRedisSharedStateEnabled() ? redisCounterStore : memoryStore);
  const time = now();
  const windowStart = Math.floor(time / USER_WINDOW_MS);

  const count = async (key: string, ttlSeconds: number): Promise<number> => {
    try {
      return await counters.increment(key, ttlSeconds);
    } catch (error) {
      // Redis is down: keep limiting from this process rather than letting calls through unmetered.
      logger.error('AI budget counter failed; using in-process counts', {
        error: error instanceof Error ? error.message : String(error),
      });
      counters = memoryStore;
      return memoryStore.increment(key, ttlSeconds);
    }
  };

  const userCalls = await count(`proofdesk:ai:user:${userKeyPart(userKey)}:${windowStart}`, USER_WINDOW_MS / 1000);
  if (userCalls > USER_MAX_CALLS) return 'user_limit';

  if (dailyLimit > 0) {
    const dayCalls = await count(`proofdesk:ai:day:${utcDay(time)}`, 2 * 24 * 60 * 60);
    if (dayCalls > dailyLimit) return 'daily_limit';
  }
  return 'ok';
};
