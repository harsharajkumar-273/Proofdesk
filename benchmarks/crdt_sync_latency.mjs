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
const BASE_HTTP_URL = process.env.COLLAB_HTTP_URL || 'http://localhost:4000';

// The collab WebSocket now requires an authenticated session
// (collaborationServer.ts closes with 1008 'authenticated session is
// required' otherwise) - closes the same access hole the preview and
// monitoring routes were hardened against. Local-test mode gives us a
// session cookie the same way the backend test suite does, via
// GET /auth/local-test.
const fetchSessionCookie = async () => {
  const response = await fetch(`${BASE_HTTP_URL}/auth/local-test`, { redirect: 'manual' });
  const cookie = response.headers.get('set-cookie');
  if (!cookie) {
    throw new Error(
      'No session cookie from /auth/local-test - is the backend running with ENABLE_LOCAL_TEST_MODE=true?'
    );
  }
  return cookie.split(';')[0];
};

// Room IDs that aren't a team:<code>:<path> key are checked against
// buildExecutor's session map, and the connecting session's login must match
// the session's creatorLogin (fixed for issue #140 - guessable room IDs used
// to grant access to anyone with any valid login). A room id benchmark-<n>
// was never a real session, so it needs a real one created via the same
// local-demo build path the backend test suite uses.
const createBuildSessionRoomId = async (sessionCookie) => {
  const response = await fetch(`${BASE_HTTP_URL}/build/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ owner: 'demo', repo: 'course-demo' }),
  });
  const body = await response.json();
  if (!response.ok || !body.sessionId) {
    throw new Error(`Failed to create a build session for the benchmark room: ${JSON.stringify(body)}`);
  }
  return body.sessionId;
};

const encodeMessage = (type, payload) => {
  const output = new Uint8Array(payload.length + 1);
  output[0] = type;
  output.set(payload, 1);
  return output;
};

const createClient = (label, roomId, sessionCookie, initialContent = '') => {
  const doc = new Y.Doc();
  const text = doc.getText('monaco');
  const awareness = new Awareness(doc);
  const ws = new WebSocket(`${BASE_WS_URL}?roomId=${encodeURIComponent(roomId)}`, {
    headers: { Cookie: sessionCookie },
  });
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

async function measureOneRound(seq, sessionCookie) {
  const roomId = await createBuildSessionRoomId(sessionCookie);
  let clientA;
  let clientB;
  try {
    clientA = await createClient('client-a', roomId, sessionCookie, `seed-${seq}`);
    clientB = await createClient('client-b', roomId, sessionCookie);

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
  const sessionCookie = await fetchSessionCookie();
  const samples = [];
  for (let i = 0; i < ROUNDS; i++) {
    try {
      const latencyMs = await measureOneRound(i, sessionCookie);
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
