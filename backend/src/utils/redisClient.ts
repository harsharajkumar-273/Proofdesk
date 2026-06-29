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

export const getRedisClient = async (): Promise<any> => {
  if (!isRedisSharedStateEnabled()) {
    throw new Error('Redis shared-state backend is not enabled.');
  }

  if (!sharedClientPromise) {
    sharedClientPromise = createConnectedClient('client');
  }

  return sharedClientPromise;
};

export const getRedisPublisher = async (): Promise<any> => {
  if (!isRedisSharedStateEnabled()) {
    throw new Error('Redis shared-state backend is not enabled.');
  }

  if (!publisherPromise) {
    publisherPromise = createConnectedClient('publisher');
  }

  return publisherPromise;
};

export const getRedisSubscriber = async (): Promise<any> => {
  if (!isRedisSharedStateEnabled()) {
    throw new Error('Redis shared-state backend is not enabled.');
  }

  if (!subscriberPromise) {
    subscriberPromise = createConnectedClient('subscriber');
  }

  return subscriberPromise;
};
