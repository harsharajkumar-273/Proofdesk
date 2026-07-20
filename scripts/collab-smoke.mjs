import WebSocket from '../backend/node_modules/ws/wrapper.mjs';
import * as Y from '../backend/node_modules/yjs/dist/yjs.mjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from '../backend/node_modules/y-protocols/awareness.js';

const MESSAGE_DOC_UPDATE = 0;
const MESSAGE_AWARENESS_UPDATE = 1;
const ROOM_ID = `smoke-${Date.now()}`;
const WS_URL = `ws://localhost:4000/collab/ws?roomId=${encodeURIComponent(ROOM_ID)}`;

const encodeMessage = (type, payload) => {
  const output = new Uint8Array(payload.length + 1);
  output[0] = type;
  output.set(payload, 1);
  return output;
};

const createClient = (label, initialContent = '') => {
  const doc = new Y.Doc();
  const text = doc.getText('monaco');
  const awareness = new Awareness(doc);
  const ws = new WebSocket(WS_URL);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`${label}: timed out waiting for initial state`));
    }, 8000);

    awareness.setLocalStateField('user', {
      clientId: `${label}-${Date.now()}`,
      name: label,
      color: label === 'client-a' ? '#60a5fa' : '#34d399',
    });

    doc.on('update', (update, origin) => {
      if (origin === ws && ws.readyState === WebSocket.OPEN) return;
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(encodeMessage(MESSAGE_DOC_UPDATE, update));
    });

    awareness.on('change', ({ added, updated, removed }, origin) => {
      if (origin === ws) return;
      if (ws.readyState !== WebSocket.OPEN) return;
      const changed = added.concat(updated, removed);
      if (changed.length === 0) return;
      ws.send(encodeMessage(MESSAGE_AWARENESS_UPDATE, encodeAwarenessUpdate(awareness, changed)));
    });

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'join',
        roomId: ROOM_ID,
        initialContent,
      }));
      ws.send(encodeMessage(MESSAGE_AWARENESS_UPDATE, encodeAwarenessUpdate(awareness, [doc.clientID])));
    });

    ws.on('message', (raw, isBinary) => {
      if (!isBinary) return;
      const message = new Uint8Array(raw);
      const messageType = message[0];
      const payload = message.subarray(1);

      if (messageType === MESSAGE_DOC_UPDATE) {
        Y.applyUpdate(doc, payload, ws);
        if (text.length > 0) {
          clearTimeout(timeout);
          resolve({ label, ws, doc, text, awareness });
        }
        return;
      }

      if (messageType === MESSAGE_AWARENESS_UPDATE) {
        applyAwarenessUpdate(awareness, payload, ws);
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
};

const waitFor = async (predicate, timeoutMs, label) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const closeClient = async (client) => {
  if (!client) return;

  client.awareness.destroy();
  client.doc.destroy();

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 500);
    client.ws.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    client.ws.close();
  });
};

let clientA;
let clientB;

try {
  clientA = await createClient('client-a', 'hello');
  clientB = await createClient('client-b');

  clientA.text.insert(clientA.text.length, ' world');

  await waitFor(() => clientB.text.toString() === 'hello world', 8000, 'document sync to client-b');
  await waitFor(
    () => clientA.awareness.getStates().size >= 2 && clientB.awareness.getStates().size >= 2,
    8000,
    'awareness propagation'
  );

  console.log(JSON.stringify({
    roomId: ROOM_ID,
    clientAText: clientA.text.toString(),
    clientBText: clientB.text.toString(),
    clientAAwarenessStates: clientA.awareness.getStates().size,
    clientBAwarenessStates: clientB.awareness.getStates().size,
  }, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await closeClient(clientA);
  await closeClient(clientB);
}
