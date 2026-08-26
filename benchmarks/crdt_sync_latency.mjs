// Real CRDT (Y.js) sync-latency benchmark for Proofdesk's collaboration
// server, over the actual WebSocket protocol at /collab/ws.
//
// This is scripts/collab-smoke.mjs's exact client setup (same Y.Doc/Awareness
// wiring, same message framing) extended with high-resolution timing and
// repeated rounds instead of a single pass/fail check, so it produces real
// p50/p95 propagation-latency numbers instead of just "sync worked".
//
// Requires the backend running locally (`npm run dev --prefix backend`, or
// the full docker-compose stack) with the collab WebSocket server reachable
// at ws://localhost:4000/collab/ws (override with COLLAB_WS_URL).
//
// Usage:
//   node benchmarks/crdt_sync_latency.mjs [--rounds 30]
//
// Prints p50/p95/avg one-way sync latency (client-a edit -> client-b sees it)
// to stdout. Paste the output into README.md once you've run it for real.

import WebSocket from '../backend/node_modules/ws/wrapper.mjs';
import * as Y from '../backend/node_modules/yjs/dist/yjs.mjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from '../backend/node_modules/y-protocols/awareness.js';

const MESSAGE_DOC_UPDATE = 0;
const MESSAGE_AWARENESS_UPDATE = 1;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const ROUNDS = Number(arg('rounds', 30));
const BASE_WS_URL = process.env.COLLAB_WS_URL || 'ws://localhost:4000/collab/ws';

const encodeMessage = (type, payload) => {
  const output = new Uint8Array(payload.length + 1);
  output[0] = type;
  output.set(payload, 1);
  return output;
};

const createClient = (label, roomId, initialContent = '') => {
  const doc = new Y.Doc();
  const text = doc.getText('monaco');
  const awareness = new Awareness(doc);
  const ws = new WebSocket(`${BASE_WS_URL}?roomId=${encodeURIComponent(roomId)}`);
  const listeners = new Set();

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

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', roomId, initialContent }));
      ws.send(encodeMessage(MESSAGE_AWARENESS_UPDATE, encodeAwarenessUpdate(awareness, [doc.clientID])));
    });

    ws.on('message', (raw, isBinary) => {
      if (!isBinary) return;
      const message = new Uint8Array(raw);
      const messageType = message[0];
      const payload = message.subarray(1);

      if (messageType === MESSAGE_DOC_UPDATE) {
        const receivedAt = performance.now();
        Y.applyUpdate(doc, payload, ws);
        listeners.forEach((fn) => fn(receivedAt));
        if (text.length > 0) {
          clearTimeout(timeout);
          resolve({ label, ws, doc, text, awareness, onUpdate: (fn) => listeners.add(fn) });
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

const closeClient = async (client) => {
  if (!client) return;
  client.awareness.destroy();
  client.doc.destroy();
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 500);
    client.ws.once('close', () => {
      clearTimeout(t);
      resolve();
    });
    client.ws.close();
  });
};

function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return NaN;
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[Math.max(0, idx)];
}

async function measureOneRound(roomId, seq) {
  let clientA;
  let clientB;
  try {
    clientA = await createClient('client-a', roomId, `seed-${seq}`);
    clientB = await createClient('client-b', roomId);

    const latencyMs = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('sync timed out')), 5000);
      clientB.onUpdate((receivedAt) => {
        clearTimeout(timeout);
        resolve(performance.now() - sentAt < 0 ? 0 : receivedAt - sentAt);
      });
      var sentAt = performance.now();
      clientA.text.insert(clientA.text.length, `-${seq}`);
    });

    return latencyMs;
  } finally {
    await closeClient(clientA);
    await closeClient(clientB);
  }
}

async function main() {
  const samples = [];
  for (let i = 0; i < ROUNDS; i++) {
    const roomId = `bench-${Date.now()}-${i}`;
    try {
      const latencyMs = await measureOneRound(roomId, i);
      samples.push(latencyMs);
      process.stdout.write(`round ${i + 1}/${ROUNDS}: ${latencyMs.toFixed(2)}ms\n`);
    } catch (err) {
      process.stderr.write(`round ${i + 1}/${ROUNDS} failed: ${err.message}\n`);
    }
  }

  if (samples.length === 0) {
    console.error('No successful rounds — is the backend/collab WebSocket server running?');
    process.exit(1);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

  const result = {
    roundsRequested: ROUNDS,
    roundsSucceeded: sorted.length,
    wsUrl: BASE_WS_URL,
    avgMs: Math.round(avg * 100) / 100,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  };

  console.log('\n=== Proofdesk CRDT (Y.js) sync latency ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('===========================================\n');
  console.log('Copy the numbers above into README.md once you have run this for real.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
