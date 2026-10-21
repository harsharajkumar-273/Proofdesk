// How long does POST /build/update take in local-test mode (the mode the README's "Docker" benchmark runs in)?
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = '/home/user/Proofdesk';
const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'local-mode-'));
const child = spawn('node', ['--import', 'tsx', 'src/server.ts'], {
  cwd: path.join(REPO, 'backend'),
  detached: true,
  stdio: 'ignore',
  env: {
    ...process.env, PORT: String(PORT), FRONTEND_URL: BASE, PROOFDESK_DATA_DIR: data, PROOFDESK_SESSION_SECRET: 'x',
    ENABLE_LOCAL_TEST_MODE: 'true', LOCAL_TEST_TOKEN: 'local-test', LOCAL_TEST_REPO_OWNER: 'demo',
    LOCAL_TEST_REPO_NAME: 'course-demo', LOCAL_TEST_REPO_PATH: path.join(REPO, 'test-repo/course-demo'),
  },
});

const headers = { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' };
const post = async (route, body) => {
  const t = performance.now();
  const res = await fetch(`${BASE}${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, ms: performance.now() - t };
};

try {
  for (let i = 0; i < 60; i += 1) {
    if (await fetch(`${BASE}/health`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const init = await post('/build/init', { owner: 'demo', repo: 'course-demo' });
  const sessionId = init.json.sessionId;
  const times = [];
  for (let i = 0; i < 40; i += 1) {
    const r = await post('/build/update', { sessionId, filePath: 'interactive.js', content: `// run ${i}\n` });
    if (r.status === 200 && r.json.success) times.push(r.ms);
  }
  times.sort((a, b) => a - b);
  const q = (p) => times[Math.max(0, Math.ceil((p / 100) * times.length) - 1)];
  console.log(JSON.stringify({
    mode: 'local-test (demo/course-demo)', buildType: init.json.buildType, initMs: Math.round(init.ms),
    updates: times.length, medianMs: Math.round(q(50) * 10) / 10, p95Ms: Math.round(q(95) * 10) / 10,
    minMs: Math.round(times[0] * 10) / 10, maxMs: Math.round(times.at(-1) * 10) / 10,
  }, null, 2));
} finally {
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
}
