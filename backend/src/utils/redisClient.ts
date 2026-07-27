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

let isReconnectingMap = new Map<string, boolean>();
const reconnectListeners: Array<() => void> = [];

export const onRedisReconnect = (callback: () => void): () => void => {
  reconnectListeners.push(callback);
  return () => {
    const idx = reconnectListeners.indexOf(callback);
    if (idx >= 0) reconnectListeners.splice(idx, 1);
  };
};

export const notifyRedisReconnect = (): void => {
  for (const listener of [...reconnectListeners]) {
    try {
      listener();
    } catch (err: any) {
      console.error('[RedisReconnect] Listener callback error:', err?.message || err);
    }
  }
};

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
  
  client.on('reconnecting', () => {
    isReconnectingMap.set(scope, true);
    console.warn(`[Redis:${scope}] Connection lost, attempting reconnection...`);
  });

  client.on('ready', () => {
    if (isReconnectingMap.get(scope)) {
      isReconnectingMap.set(scope, false);
      console.log(`[Redis:${scope}] Reconnected and ready.`);
      notifyRedisReconnect();
    }
  });

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
