import { WebSocketServer } from 'ws';
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
import {
  getRedisClient,
  getRedisPublisher,
  getRedisSubscriber,
  isRedisSharedStateEnabled,
} from '../utils/redisClient.js';

const MESSAGE_DOC_UPDATE = 0;
const MESSAGE_AWARENESS_UPDATE = 1;
const DOC_RETENTION_MS = 10 * 60 * 1000;
const SNAPSHOT_SYNC_INTERVAL_MS = 1000;
const EXTERNAL_SYNC_ORIGIN = Symbol('proofdesk-external-sync');
const INSTANCE_ID = crypto.randomBytes(8).toString('hex');
const REDIS_CHANNEL_PREFIX = 'proofdesk:collab:';
const REDIS_SNAPSHOT_PREFIX = 'proofdesk:collab-snapshot:';
const REDIS_SNAPSHOT_TTL_SECONDS = 7 * 24 * 60 * 60;

const docs = new Map();
let redisSubscriptionPromise = null;

const getDocSnapshotPath = (roomId) =>
  path.join(
    getProofdeskDataPath('collaboration'),
    `${crypto.createHash('sha1').update(roomId).digest('hex')}.bin`
  );

const getRedisSnapshotKey = (roomId) => `${REDIS_SNAPSHOT_PREFIX}${roomId}`;
const getRedisChannelName = (roomId) => `${REDIS_CHANNEL_PREFIX}${roomId}`;

const encodeBinaryPayload = (payload) => Buffer.from(payload).toString('base64');
const decodeBinaryPayload = (payload) => new Uint8Array(Buffer.from(payload, 'base64'));

const persistDocState = async (sharedDoc) => {
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
  } catch (error) {
    console.error('[Collab] Failed to persist room state:', error.message);
  }
};

const loadDocState = async (sharedDoc) => {
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

const syncDocStateFromDisk = async (sharedDoc) => {
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
  } catch (error) {
    console.error('[Collab] Failed to sync room state from disk:', error.message);
  }
};

const publishCollaborationEvent = async (roomId, payload) => {
  if (!isRedisSharedStateEnabled()) return;

  try {
    const publisher = await getRedisPublisher();
    await publisher.publish(getRedisChannelName(roomId), JSON.stringify({
      ...payload,
      instanceId: INSTANCE_ID,
    }));
  } catch (error) {
    console.error('[Collab] Failed to publish room update:', error.message);
  }
};

const ensureRedisSubscription = async () => {
  if (!isRedisSharedStateEnabled()) return;
  if (redisSubscriptionPromise) return redisSubscriptionPromise;

  redisSubscriptionPromise = (async () => {
    const subscriber = await getRedisSubscriber();
    await subscriber.pSubscribe(`${REDIS_CHANNEL_PREFIX}*`, (message, channel) => {
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
      } catch (error) {
        console.error('[Collab] Failed to process Redis room update:', error.message);
      }
    });
  })();

  return redisSubscriptionPromise;
};

const encodeMessage = (type, payload) => {
  const output = new Uint8Array(payload.length + 1);
  output[0] = type;
  output.set(payload, 1);
  return output;
};

const broadcast = (sharedDoc, payload, skipConnection = null) => {
  for (const connection of sharedDoc.connections.keys()) {
    if (connection === skipConnection) continue;
    if (connection.readyState !== connection.OPEN) continue;
    connection.send(payload);
  }
};

class SharedCollaborationDoc {
  constructor(roomId) {
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
      broadcast(this, encodeMessage(MESSAGE_DOC_UPDATE, update), origin || null);

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

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      this.updatedAt = Date.now();
      const changedClients = added.concat(updated, removed);
      const awarenessUpdate = encodeAwarenessUpdate(this.awareness, changedClients);

      if (origin && this.connections.has(origin)) {
        const controlledIds = this.connections.get(origin);
        added.forEach((clientId) => controlledIds.add(clientId));
        updated.forEach((clientId) => controlledIds.add(clientId));
        removed.forEach((clientId) => controlledIds.delete(clientId));
      }

      broadcast(this, encodeMessage(MESSAGE_AWARENESS_UPDATE, awarenessUpdate), origin || null);

      if (origin !== EXTERNAL_SYNC_ORIGIN) {
        void publishCollaborationEvent(this.roomId, {
          type: 'awareness',
          payload: encodeBinaryPayload(awarenessUpdate),
        });
      }
    });
  }
}

const isValidRoomId = (roomId) =>
  typeof roomId === 'string' && roomId.length > 0 && roomId.length <= 1024;

const getOrCreateDoc = (roomId) => {
  if (!docs.has(roomId)) {
    const sharedDoc = new SharedCollaborationDoc(roomId);
    sharedDoc.loadPromise = loadDocState(sharedDoc);
    docs.set(roomId, sharedDoc);
  }
  return docs.get(roomId);
};

const scheduleDocCleanup = (roomId, sharedDoc) => {
  setTimeout(() => {
    const latest = docs.get(roomId);
    if (!latest || latest !== sharedDoc) return;
    if (latest.connections.size > 0) return;
    if (Date.now() - latest.updatedAt < DOC_RETENTION_MS) return;
    if (latest.snapshotSyncTimer) {
      clearInterval(latest.snapshotSyncTimer);
      latest.snapshotSyncTimer = null;
    }
    docs.delete(roomId);
  }, DOC_RETENTION_MS).unref();
};

const sendCurrentState = (sharedDoc, connection) => {
  const docUpdate = Y.encodeStateAsUpdate(sharedDoc.ydoc);
  connection.send(encodeMessage(MESSAGE_DOC_UPDATE, docUpdate));

  const awarenessStates = [...sharedDoc.awareness.getStates().keys()];
  if (awarenessStates.length > 0) {
    const awarenessUpdate = encodeAwarenessUpdate(sharedDoc.awareness, awarenessStates);
    connection.send(encodeMessage(MESSAGE_AWARENESS_UPDATE, awarenessUpdate));
  }
};

const closeConnection = (sharedDoc, connection) => {
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

export const attachCollaborationServer = () => {
  const wss = new WebSocketServer({ noServer: true });

  if (isRedisSharedStateEnabled()) {
    void ensureRedisSubscription();
  }

  wss.on('connection', async (connection, request) => {
    const requestUrl = new URL(request.url || '', 'http://localhost');
    const roomId = requestUrl.searchParams.get('roomId');
    const authSession = await authSessionStore.getSessionFromRequest({
      headers: request.headers,
    });

    if (!authSession?.accessToken) {
      connection.close(1008, 'authenticated session is required');
      return;
    }

    if (!isValidRoomId(roomId)) {
      connection.close(1008, 'roomId is required');
      return;
    }

    const sharedDoc = getOrCreateDoc(roomId);
    await sharedDoc.loadPromise;
    sharedDoc.connections.set(connection, new Set());
    sharedDoc.updatedAt = Date.now();

    connection.on('message', (rawMessage, isBinary) => {
      try {
        if (!isBinary) {
          const payload = JSON.parse(rawMessage.toString());
          if (payload.type === 'join') {
            if (
              typeof payload.initialContent === 'string'
              && payload.initialContent.length > 0
              && sharedDoc.text.length === 0
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
      } catch (error) {
        console.error('[Collab] Message handling error:', error.message);
      }
    });

    connection.on('close', () => closeConnection(sharedDoc, connection));
    connection.on('error', () => closeConnection(sharedDoc, connection));
  });

  return wss;
};
