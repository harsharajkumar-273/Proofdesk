import { WebSocket, WebSocketServer } from 'ws';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import authSessionStore from './authSessionStore.js';
import { getProofdeskDataPath } from '../utils/dataPaths.js';
import { websocketActiveConnections } from './metricsService.js';
import {
  getRedisClient,
  getRedisPublisher,
  getRedisSubscriber,
  isRedisSharedStateEnabled,
} from '../utils/redisClient.js';
import { IncomingMessage } from 'http';

const MESSAGE_DOC_UPDATE = 0;
const MESSAGE_AWARENESS_UPDATE = 1;
const DOC_RETENTION_MS = 10 * 60 * 1000;
const SNAPSHOT_SYNC_INTERVAL_MS = 1000;
const EXTERNAL_SYNC_ORIGIN = Symbol('proofdesk-external-sync');
const INSTANCE_ID = crypto.randomBytes(8).toString('hex');
const REDIS_CHANNEL_PREFIX = 'proofdesk:collab:';
const REDIS_SNAPSHOT_PREFIX = 'proofdesk:collab-snapshot:';
const REDIS_SNAPSHOT_TTL_SECONDS = 7 * 24 * 60 * 60;

const docs = new Map<string, SharedCollaborationDoc>();
let redisSubscriptionPromise: Promise<void> | null = null;

const getDocSnapshotPath = (roomId: string): string =>
  path.join(
    getProofdeskDataPath('collaboration'),
    `${crypto.createHash('sha1').update(roomId).digest('hex')}.bin`
  );

const getRedisSnapshotKey = (roomId: string): string => `${REDIS_SNAPSHOT_PREFIX}${roomId}`;
const getRedisChannelName = (roomId: string): string => `${REDIS_CHANNEL_PREFIX}${roomId}`;

const encodeBinaryPayload = (payload: Uint8Array): string => Buffer.from(payload).toString('base64');
const decodeBinaryPayload = (payload: string): Uint8Array => new Uint8Array(Buffer.from(payload, 'base64'));

const persistDocState = async (sharedDoc: SharedCollaborationDoc): Promise<void> => {
  try {
    const snapshot = Buffer.from(Y.encodeStateAsUpdate(sharedDoc.ydoc));

    if (isRedisSharedStateEnabled()) {
      const client = await getRedisClient();
      await client.set(getRedisSnapshotKey(sharedDoc.roomId), snapshot.toString('base64'), {
        EX: REDIS_SNAPSHOT_TTL_SECONDS,
      });
      sharedDoc.lastSnapshotVersion = Date.now();
      return;
    }

    const snapshotPath = getDocSnapshotPath(sharedDoc.roomId);
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.writeFile(snapshotPath, snapshot);
    const stats = await fs.stat(snapshotPath).catch(() => null);
    sharedDoc.lastSnapshotMtimeMs = stats?.mtimeMs || Date.now();
  } catch (error: any) {
    console.error('[Collab] Failed to persist room state:', error.message);
  }
};

const loadDocState = async (sharedDoc: SharedCollaborationDoc): Promise<void> => {
  try {
    if (isRedisSharedStateEnabled()) {
      const client = await getRedisClient();
      const snapshot = await client.get(getRedisSnapshotKey(sharedDoc.roomId));
      if (!snapshot) return;
      Y.applyUpdate(sharedDoc.ydoc, decodeBinaryPayload(snapshot));
      sharedDoc.lastSnapshotVersion = Date.now();
      return;
    }

    const snapshotPath = getDocSnapshotPath(sharedDoc.roomId);
    const snapshot = await fs.readFile(snapshotPath);
    if (snapshot.length > 0) {
      Y.applyUpdate(sharedDoc.ydoc, new Uint8Array(snapshot));
    }
    const stats = await fs.stat(snapshotPath).catch(() => null);
    sharedDoc.lastSnapshotMtimeMs = stats?.mtimeMs || sharedDoc.lastSnapshotMtimeMs;
  } catch {
    // No persisted snapshot yet.
  }
};

const syncDocStateFromDisk = async (sharedDoc: SharedCollaborationDoc): Promise<void> => {
  try {
    const snapshotPath = getDocSnapshotPath(sharedDoc.roomId);
    const stats = await fs.stat(snapshotPath).catch(() => null);
    if (!stats || stats.mtimeMs <= sharedDoc.lastSnapshotMtimeMs) {
      return;
    }

    const snapshot = await fs.readFile(snapshotPath);
    sharedDoc.lastSnapshotMtimeMs = stats.mtimeMs;
    if (snapshot.length > 0) {
      Y.applyUpdate(sharedDoc.ydoc, new Uint8Array(snapshot), EXTERNAL_SYNC_ORIGIN);
    }
  } catch (error: any) {
    console.error('[Collab] Failed to sync room state from disk:', error.message);
  }
};

const publishCollaborationEvent = async (roomId: string, payload: any): Promise<void> => {
  if (!isRedisSharedStateEnabled()) return;

  try {
    const publisher = await getRedisPublisher();
    await publisher.publish(
      getRedisChannelName(roomId),
      JSON.stringify({
        ...payload,
        instanceId: INSTANCE_ID,
      })
    );
  } catch (error: any) {
    console.error('[Collab] Failed to publish room update:', error.message);
  }
};

const ensureRedisSubscription = async (): Promise<void> => {
  if (!isRedisSharedStateEnabled()) return;
  if (redisSubscriptionPromise) return redisSubscriptionPromise;

  redisSubscriptionPromise = (async () => {
    const subscriber = await getRedisSubscriber();
    await subscriber.pSubscribe(`${REDIS_CHANNEL_PREFIX}*`, (message: string, channel: string) => {
      try {
        const roomId = channel.slice(REDIS_CHANNEL_PREFIX.length);
        const sharedDoc = docs.get(roomId);
        if (!sharedDoc) return;

        const payload = JSON.parse(message);
        if (payload.instanceId === INSTANCE_ID) {
          return;
        }

        if (payload.type === 'doc' && payload.payload) {
          Y.applyUpdate(sharedDoc.ydoc, decodeBinaryPayload(payload.payload), EXTERNAL_SYNC_ORIGIN);
          return;
        }

        if (payload.type === 'awareness' && payload.payload) {
          applyAwarenessUpdate(sharedDoc.awareness, decodeBinaryPayload(payload.payload), EXTERNAL_SYNC_ORIGIN);
        }
      } catch (error: any) {
        console.error('[Collab] Failed to process Redis room update:', error.message);
      }
    });
  })();

  return redisSubscriptionPromise;
};

const encodeMessage = (type: number, payload: Uint8Array): Uint8Array => {
  const output = new Uint8Array(payload.length + 1);
  output[0] = type;
  output.set(payload, 1);
  return output;
};

const broadcast = (sharedDoc: SharedCollaborationDoc, payload: Uint8Array, skipConnection: WebSocket | null = null): void => {
  for (const connection of sharedDoc.connections.keys()) {
    if (connection === skipConnection) continue;
    if (connection.readyState !== connection.OPEN) continue;
    connection.send(payload);
  }
};

class SharedCollaborationDoc {
  public roomId: string;
  public ydoc: Y.Doc;
  public text: Y.Text;
  public awareness: Awareness;
  public connections: Map<WebSocket, Set<number>>;
  public updatedAt: number;
  public persistTimer: NodeJS.Timeout | null;
  public loadPromise: Promise<void>;
  public lastSnapshotMtimeMs: number;
  public lastSnapshotVersion: number;
  public snapshotSyncTimer: NodeJS.Timeout | null;

  constructor(roomId: string) {
    this.roomId = roomId;
    this.ydoc = new Y.Doc();
    this.text = this.ydoc.getText('monaco');
    this.awareness = new Awareness(this.ydoc);
    this.connections = new Map();
    this.updatedAt = Date.now();
    this.persistTimer = null;
    this.loadPromise = Promise.resolve();
    this.lastSnapshotMtimeMs = 0;
    this.lastSnapshotVersion = 0;
    this.snapshotSyncTimer = null;

    if (!isRedisSharedStateEnabled()) {
      this.snapshotSyncTimer = setInterval(() => {
        void syncDocStateFromDisk(this);
      }, SNAPSHOT_SYNC_INTERVAL_MS);
      if (typeof this.snapshotSyncTimer.unref === 'function') {
        this.snapshotSyncTimer.unref();
      }
    }

    this.ydoc.on('update', (update, origin) => {
      this.updatedAt = Date.now();
      broadcast(this, encodeMessage(MESSAGE_DOC_UPDATE, update), origin instanceof WebSocket ? origin : null);

      if (origin === EXTERNAL_SYNC_ORIGIN) {
        return;
      }

      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
      }
      const timer = setTimeout(() => {
        this.persistTimer = null;
        void persistDocState(this);
      }, 250);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
      this.persistTimer = timer;

      void publishCollaborationEvent(this.roomId, {
        type: 'doc',
        payload: encodeBinaryPayload(update),
      });
    });

    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: any) => {
      this.updatedAt = Date.now();
      const changedClients = added.concat(updated, removed);
      const awarenessUpdate = encodeAwarenessUpdate(this.awareness, changedClients);

      if (origin && this.connections.has(origin)) {
        const controlledIds = this.connections.get(origin);
        if (controlledIds) {
          added.forEach((clientId: number) => controlledIds.add(clientId));
          updated.forEach((clientId: number) => controlledIds.add(clientId));
          removed.forEach((clientId: number) => controlledIds.delete(clientId));
        }
      }

      broadcast(this, encodeMessage(MESSAGE_AWARENESS_UPDATE, awarenessUpdate), origin instanceof WebSocket ? origin : null);

      if (origin !== EXTERNAL_SYNC_ORIGIN) {
        void publishCollaborationEvent(this.roomId, {
          type: 'awareness',
          payload: encodeBinaryPayload(awarenessUpdate),
        });
      }
    });
  }
}

const isValidRoomId = (roomId: any): boolean =>
  typeof roomId === 'string' && roomId.length > 0 && roomId.length <= 1024;

const getOrCreateDoc = (roomId: string): SharedCollaborationDoc => {
  if (!docs.has(roomId)) {
    const sharedDoc = new SharedCollaborationDoc(roomId);
    sharedDoc.loadPromise = loadDocState(sharedDoc);
    docs.set(roomId, sharedDoc);
  }
  return docs.get(roomId)!;
};

const scheduleDocCleanup = (roomId: string, sharedDoc: SharedCollaborationDoc): void => {
  const timer = setTimeout(() => {
    const latest = docs.get(roomId);
    if (!latest || latest !== sharedDoc) return;
    if (latest.connections.size > 0) return;
    if (Date.now() - latest.updatedAt < DOC_RETENTION_MS) return;
    if (latest.snapshotSyncTimer) {
      clearInterval(latest.snapshotSyncTimer);
      latest.snapshotSyncTimer = null;
    }
    docs.delete(roomId);
  }, DOC_RETENTION_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
};

const sendCurrentState = (sharedDoc: SharedCollaborationDoc, connection: WebSocket): void => {
  const docUpdate = Y.encodeStateAsUpdate(sharedDoc.ydoc);
  connection.send(encodeMessage(MESSAGE_DOC_UPDATE, docUpdate));

  const awarenessStates = [...sharedDoc.awareness.getStates().keys()];
  if (awarenessStates.length > 0) {
    const awarenessUpdate = encodeAwarenessUpdate(sharedDoc.awareness, awarenessStates);
    connection.send(encodeMessage(MESSAGE_AWARENESS_UPDATE, awarenessUpdate));
  }
};

const closeConnection = (sharedDoc: SharedCollaborationDoc, connection: WebSocket): void => {
  if (!sharedDoc.connections.has(connection)) return;

  const controlledIds = sharedDoc.connections.get(connection);
  sharedDoc.connections.delete(connection);

  if (controlledIds && controlledIds.size > 0) {
    removeAwarenessStates(sharedDoc.awareness, [...controlledIds], connection);
  }

  sharedDoc.updatedAt = Date.now();

  if (sharedDoc.connections.size === 0) {
    scheduleDocCleanup(sharedDoc.roomId, sharedDoc);
  }
};

const processConnectionMessage = (
  sharedDoc: SharedCollaborationDoc,
  connection: WebSocket,
  rawMessage: any,
  isBinary: boolean
): void => {
  try {
    if (!isBinary) {
      const payload = JSON.parse(rawMessage.toString());
      if (payload.type === 'join') {
        if (
          typeof payload.initialContent === 'string' &&
          payload.initialContent.length > 0 &&
          sharedDoc.text.length === 0
        ) {
          sharedDoc.ydoc.transact(() => {
            sharedDoc.text.insert(0, payload.initialContent);
          }, connection);
        }

        sendCurrentState(sharedDoc, connection);
      }
      return;
    }

    const message = new Uint8Array(rawMessage);
    const messageType = message[0];
    const payload = message.subarray(1);

    if (messageType === MESSAGE_DOC_UPDATE) {
      Y.applyUpdate(sharedDoc.ydoc, payload, connection);
      return;
    }

    if (messageType === MESSAGE_AWARENESS_UPDATE) {
      applyAwarenessUpdate(sharedDoc.awareness, payload, connection);
    }
  } catch (error: any) {
    console.error('[Collab] Message handling error:', error.message);
  }
};

export const attachCollaborationServer = (): WebSocketServer => {
  const wss = new WebSocketServer({ noServer: true });

  if (isRedisSharedStateEnabled()) {
    void ensureRedisSubscription();
  }

  wss.on('connection', (connection: WebSocket, request: IncomingMessage) => {
    websocketActiveConnections.inc({ type: 'collaboration' });
    const requestUrl = new URL(request.url || '', 'http://localhost');
    const roomId = requestUrl.searchParams.get('roomId');
    const pendingMessages: [any, boolean][] = [];
    let sharedDoc: SharedCollaborationDoc | null = null;
    let ready = false;
    let closed = false;
    let decDone = false;

    const decrementConn = () => {
      if (!decDone) {
        websocketActiveConnections.dec({ type: 'collaboration' });
        decDone = true;
      }
    };

    connection.on('message', (rawMessage: any, isBinary: boolean) => {
      if (!ready || !sharedDoc) {
        pendingMessages.push([rawMessage, isBinary]);
        return;
      }

      processConnectionMessage(sharedDoc, connection, rawMessage, isBinary);
    });

    connection.on('close', () => {
      closed = true;
      if (sharedDoc) closeConnection(sharedDoc, connection);
      decrementConn();
    });
    connection.on('error', () => {
      closed = true;
      if (sharedDoc) closeConnection(sharedDoc, connection);
      decrementConn();
    });

    void (async () => {
      const authSession = await authSessionStore.getSessionFromRequest({
        headers: request.headers as Record<string, string>,
      });

      if (!authSession?.accessToken) {
        connection.close(1008, 'authenticated session is required');
        return;
      }

      if (!isValidRoomId(roomId)) {
        connection.close(1008, 'roomId is required');
        return;
      }

      sharedDoc = getOrCreateDoc(roomId!);
      await sharedDoc.loadPromise;
      if (closed) return;

      sharedDoc.connections.set(connection, new Set());
      sharedDoc.updatedAt = Date.now();
      ready = true;

      while (pendingMessages.length > 0) {
        const entry = pendingMessages.shift();
        if (entry) {
          const [rawMessage, isBinary] = entry;
          processConnectionMessage(sharedDoc, connection, rawMessage, isBinary);
        }
      }
    })().catch((error: any) => {
      console.error('[Collab] Connection setup error:', error.message);
      try {
        connection.close(1011, 'collaboration setup failed');
      } catch {
        // Connection may already be closed.
      }
    });
  });

  return wss;
};
