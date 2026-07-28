import { createClient, RedisClientType } from 'redis';

const REDIS_URL = (): string => String(process.env.PROOFDESK_REDIS_URL || '').trim();

let sharedClientPromise: Promise<any> | null = null;
let publisherPromise: Promise<any> | null = null;
let subscriberPromise: Promise<any> | null = null;

const logRedisError = (scope: string, error: Error): void => {
  console.error(`[Redis:${scope}] ${error.message}`);
};

export const getSharedStateBackend = (): 'redis' | 'filesystem' =>
  String(process.env.PROOFDESK_SHARED_STATE_BACKEND || 'filesystem').trim().toLowerCase() === 'redis'
    ? 'redis'
    : 'filesystem';

export const isRedisSharedStateEnabled = (): boolean =>
  getSharedStateBackend() === 'redis' && REDIS_URL().length > 0;

const createConnectedClient = async (scope: string): Promise<any> => {
  const client = createClient({
    url: REDIS_URL(),
    socket: {
      reconnectStrategy(retries) {
        return Math.min(1000 * (retries + 1), 5000);
      },
    },
  });

  client.on('error', (error) => logRedisError(scope, error));
  await client.connect();
  return client;
};

/**
 * Cache a connection promise, clearing the cache if the attempt fails.
 *
 * `connect` is passed in rather than called directly so the caching behaviour can be exercised
 * without a Redis server: the node-redis client retries on a backoff, so a test against a refused
 * port would hang rather than fail.
 *
 * The point of the `catch` is that a rejected promise is still a settled promise. Caching one means
 * every later caller re-awaits the same failure, so a Redis server that was briefly unreachable at
 * startup leaves the process permanently broken even once Redis is healthy again. Clearing the slot
 * on failure lets the next caller start a fresh attempt.
 *
 * The handler re-throws, so the caller that triggered the attempt still sees the real error. It
 * clears the slot only if the slot still holds *this* promise — a reset in between should not have
 * its replacement discarded by an older failure arriving late.
 */
export const cacheConnection = (
  connect: () => Promise<any>,
  read: () => Promise<any> | null,
  write: (promise: Promise<any> | null) => void
): Promise<any> => {
  const cached = read();
  if (cached) return cached;

  const pending: Promise<any> = connect().catch((error) => {
    if (read() === pending) write(null);
    throw error;
  });

  write(pending);
  return pending;
};

const assertEnabled = (): void => {
  if (!isRedisSharedStateEnabled()) {
    throw new Error('Redis shared-state backend is not enabled.');
  }
};

export const getRedisClient = async (): Promise<any> => {
  assertEnabled();
  return cacheConnection(
    () => createConnectedClient('client'),
    () => sharedClientPromise,
    (promise) => {
      sharedClientPromise = promise;
    }
  );
};

export const getRedisPublisher = async (): Promise<any> => {
  assertEnabled();
  return cacheConnection(
    () => createConnectedClient('publisher'),
    () => publisherPromise,
    (promise) => {
      publisherPromise = promise;
    }
  );
};

export const getRedisSubscriber = async (): Promise<any> => {
  assertEnabled();
  return cacheConnection(
    () => createConnectedClient('subscriber'),
    () => subscriberPromise,
    (promise) => {
      subscriberPromise = promise;
    }
  );
};

/**
 * Drop every cached connection promise.
 *
 * Exists so a caller that knows the connections are stale — a test between cases, or a shutdown
 * path — can force the next call to reconnect rather than waiting for a failure to clear the slot.
 */
export const resetRedisClients = (): void => {
  sharedClientPromise = null;
  publisherPromise = null;
  subscriberPromise = null;
};
