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
import buildExecutor from './buildExecutor.js';
import teamSessionStore, { normalizeTeamSessionCode } from './teamSessions.js';
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

  // Failures are not cached.
  //
  // The memo above exists so the subscription is established once, but it used
  // to retain a rejected promise just as readily as a fulfilled one. If
  // getRedisSubscriber() or pSubscribe() failed even once — Redis not yet up
  // during a rolling restart, for instance — every later call returned that
  // same rejection without retrying, and the only call site (line 369) is
  // `void ensureRedisSubscription()`, which discards it. Cross-instance sync
  // then never establishes and nothing reports why.
  //
  // Clearing the memo on failure lets the next connection attempt retry.
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
  })().catch((error: any) => {
    redisSubscriptionPromise = null;
    console.error('[Collab] Redis subscription failed, will retry on next attempt:', error?.message);
    throw error;
  });

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

// Room IDs produced by the client take the form `team:<code>:<path>`.
const TEAM_ROOM_PREFIX = 'team:';

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
    // The debounced persist is the one that outlives the document. Its callback closes over
    // `latest`, so leaving it pending keeps the whole doc — and its Yjs state — reachable after the
    // map entry is gone, and fires a write for a room nobody is in. `snapshotSyncTimer` above was
    // already handled; this is the same argument for the other timer.
    if (latest.persistTimer) {
      clearTimeout(latest.persistTimer);
      latest.persistTimer = null;
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

      const login = authSession.user?.login;
      if (!login) {
        connection.close(1008, 'authenticated user required');
        return;
      }

      // Room IDs are team-session keys, not build-session IDs.
      //
      // buildCollaborationRoomId() composes `team:<code>:<path>`, and it is the
      // only producer of room IDs in the client. Looking that string up in
      // buildExecutor's map — which is keyed by 16-hex build IDs from
      // crypto.randomBytes(8) — could never match, so every connection was
      // closed as 'invalid session', including the room creator's.
      //
      // Authorisation belongs against the team session, which is also where the
      // room's identity actually lives.
      if (typeof roomId === 'string' && roomId.startsWith(TEAM_ROOM_PREFIX)) {
        // Take the segment between the first two colons; the trailing file path
        // may itself contain colons, so only the first split point matters.
        const code = normalizeTeamSessionCode(roomId.slice(TEAM_ROOM_PREFIX.length).split(':')[0]);

        if (!code) {
          connection.close(1008, 'invalid session');
          return;
        }

        const teamSession = await teamSessionStore.getSession(code);
        if (!teamSession) {
          connection.close(1008, 'invalid session');
          return;
        }

        // Possession of a valid, unexpired invite code is the boundary.
        //
        // TeamSession records code, repo, hostName, hostLogin and timestamps —
        // there is no joiner list, so there is no per-user membership to test
        // against. Restricting to hostLogin instead would deny every invited
        // collaborator, which is the entire purpose of a team session.
        //
        // This is weaker than per-user membership and stronger than the nothing
        // that preceded #147: an authenticated caller must still hold a code
        // that resolves to a live session, so the guessed-room-ID attack from
        // #140 stays closed. Tracking joiners would allow a tighter check and
        // is worth doing separately.
      } else {
        // Any other room ID shape is treated as a build session, as before.
        const session = buildExecutor.getSession(roomId as string);
        if (!session) {
          connection.close(1008, 'invalid session');
          return;
        }

        if (!session.creatorLogin || session.creatorLogin !== login) {
          connection.close(1008, 'access denied');
          return;
        }
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
