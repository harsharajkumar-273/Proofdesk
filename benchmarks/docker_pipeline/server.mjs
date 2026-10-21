#!/usr/bin/env node
// End-to-end benchmark through the real backend HTTP API and the real Docker
// build path. It measures what a person using Proofdesk waits for, and checks
// that what gets published is correct.
//
// GitHub is replaced by a local bare git repository (via a git `insteadOf`
// rule), so `git ls-remote` and `git clone --depth=1` run for real but without
// network latency. Everything else (queue, container start, docker exec,
// preview sync, share links) is the production code.
//
// Each cycle (repeated --runs times) produces one sample for every condition:
//
//   open-miss-cold          new commit pushed -> POST /build/init -> build in a NEW container
//   open-hit                same commit again -> POST /build/init -> served from the build cache
//   edit-publish-changed    edit a file -> rebuild in the RUNNING container -> publish -> fetch
//   edit-publish-unchanged  save identical content -> rebuild -> publish -> fetch
//
// "Edit finished -> verified publication" is measured from the moment the edit
// request is sent until the public share URL has been fetched and its content
// verified. Human typing/clicking time is outside what a script can measure.
//
// Usage: node server.mjs --runs 50 --out results/<name> [--seed 1] [--port 4150]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureEnvironment, nowMs, openResults, run, sha256, sleep } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]);
    return acc;
  }, []),
);

const RUNS = Number(args.runs ?? 50);
const SEED = Number(args.seed ?? 1);
const PORT = Number(args.port ?? 4150);
const IMAGE = args.image ?? 'mra-pretext-builder';
const CONTENT = path.resolve(args.content ?? path.join(repoRoot, 'backend/assets/ila-toolchain'));
const EDIT_FILE = args['edit-file'] ?? 'demos/rabbits.html';
// The page that is fetched and checked after every build / publication (a straight copy of the edited source).
const VERIFY_FILE = args['verify-file'] ?? EDIT_FILE;
const OUT = path.resolve(args.out ?? path.join(here, 'results', new Date().toISOString().replace(/[:.]/g, '-')));
const DEVIATIONS = args.deviations ? JSON.parse(fs.readFileSync(args.deviations, 'utf-8')) : [];
const OWNER = 'bench';
const REPO = 'book';
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'local-test';
const BUILD_TIMEOUT_MS = Number(args['timeout-s'] ?? 900) * 1000;
const NET_HOST = args['net-host'] === 'true';
const USE_REDIS = args.redis === 'true'; // run the backend as deployed: BullMQ on Redis (docker-compose.yml uses redis:7-alpine)
const REDIS_PORT = Number(args['redis-port'] ?? 6390);
const REDIS_IMAGE = args['redis-image'] ?? 'redis:7-alpine';

const git = (cwd, ...a) => run('git', a, { cwd });

// ---------------------------------------------------------------------------
// The stand-in for GitHub: a bare repo plus a work clone to make commits with.
// ---------------------------------------------------------------------------
async function makeRemote(root) {
  const bare = path.join(root, 'remote', `${REPO}.git`);
  const work = path.join(root, 'work');
  fs.mkdirSync(path.dirname(bare), { recursive: true });
  await git(root, 'init', '--bare', '-b', 'main', bare);
  fs.cpSync(CONTENT, work, { recursive: true });
  await git(work, 'init', '-b', 'main');
  await git(work, 'config', 'user.email', 'bench@example.test');
  await git(work, 'config', 'user.name', 'bench');
  await git(work, 'add', '-A');
  await git(work, 'commit', '-m', 'base content');
  await git(work, 'remote', 'add', 'origin', `file://${bare}`);
  await git(work, 'push', 'origin', 'main');
  const gitconfig = path.join(root, 'gitconfig');
  fs.writeFileSync(
    gitconfig,
    `[url "file://${bare}"]\n\tinsteadOf = https://github.com/${OWNER}/${REPO}.git\n[protocol "file"]\n\tallow = always\n`,
  );
  return { bare, work, gitconfig };
}

function editContent(original, marker) {
  if (EDIT_FILE.endsWith('.html')) return original.replace('</body>', `<p data-bench>${marker}</p>\n</body>`);
  if (EDIT_FILE.endsWith('.xml')) return original.replace('</course>', `  <section title="Bench"><paragraph>${marker}</paragraph></section>\n</course>`);
  return `${original}\n// ${marker}\n`;
}

async function pushNewCommit(remote, marker) {
  const file = path.join(remote.work, EDIT_FILE);
  fs.writeFileSync(file, editContent(fs.readFileSync(path.join(CONTENT, EDIT_FILE), 'utf-8'), marker));
  await git(remote.work, 'add', '-A');
  await git(remote.work, 'commit', '-m', `edit ${marker}`);
  await git(remote.work, 'push', 'origin', 'main');
  return (await git(remote.work, 'rev-parse', 'HEAD')).stdout.trim();
}

// ---------------------------------------------------------------------------
// The backend under test
// ---------------------------------------------------------------------------
async function startBackend(root, remote) {
  // Refuse to run if something already answers on this port: otherwise the health check below
  // could be satisfied by a stale backend from an earlier run and every result would be wrong.
  const occupied = await fetch(`${BASE}/health`).then(() => true, () => false);
  if (occupied) throw new Error(`port ${PORT} is already in use; stop the other backend or pass --port`);
  const logFile = path.join(OUT, 'backend.log');
  const log = fs.openSync(logFile, 'w');
  const env = {
    ...process.env,
    PORT: String(PORT),
    FRONTEND_URL: BASE,
    PROOFDESK_DATA_DIR: path.join(root, 'data'),
    PROOFDESK_SESSION_SECRET: 'benchmark-secret',
    PROOFDESK_DOCKER_IMAGE: IMAGE,
    GIT_CONFIG_GLOBAL: remote.gitconfig,
    GIT_TERMINAL_PROMPT: '0',
    // Disables the 3-builds-per-10-minutes limiter on POST /build/init, which
    // would otherwise throttle a 50-run benchmark. The demo repo is NOT used
    // (owner/repo below do not match it), so the real build path runs.
    ENABLE_LOCAL_TEST_MODE: 'true',
    LOCAL_TEST_TOKEN: TOKEN,
    LOCAL_TEST_REPO_OWNER: 'demo',
    LOCAL_TEST_REPO_NAME: 'course-demo',
    LOCAL_TEST_REPO_PATH: path.join(repoRoot, 'backend/assets/ila-toolchain'),
  };
  // Sandbox only: give `docker run` the network settings build containers need (see docker-shim/docker).
  if (NET_HOST) env.PATH = `${path.join(here, 'docker-shim')}:${process.env.PATH}`;
  delete env.GITHUB_PERSONAL_TOKEN; // keep the GitHub-releases cache step out of the measurement
  if (USE_REDIS) {
    env.PROOFDESK_SHARED_STATE_BACKEND = 'redis';
    env.PROOFDESK_REDIS_URL = `redis://127.0.0.1:${REDIS_PORT}`;
  } else {
    delete env.PROOFDESK_REDIS_URL; // in-process queue
    delete env.PROOFDESK_SHARED_STATE_BACKEND;
  }
  const child = spawn('node', ['--import', 'tsx', 'src/server.ts'], {
    cwd: path.join(repoRoot, 'backend'),
    env,
    stdio: ['ignore', log, log],
  });
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return child;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) throw new Error(`backend exited early; see ${logFile}`);
    await sleep(500);
  }
  throw new Error('backend did not become healthy');
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function api(method, route, body) {
  const started = nowMs();
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, json, text, ms: nowMs() - started };
}

/** Reads the build-log SSE stream until the `done` event and returns its payload. */
async function waitForDone(sessionId) {
  const res = await fetch(`${BASE}/build/logs/${sessionId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = nowMs() + BUILD_TIMEOUT_MS;
  while (nowMs() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const match = buffer.match(/event: done\ndata: (.*)\n\n/);
    if (match) {
      await reader.cancel();
      return JSON.parse(match[1]);
    }
  }
  await reader.cancel().catch(() => {});
  throw new Error('timed out waiting for the build to finish');
}

async function fetchArtifact(sessionId, entry) {
  const r = await api('GET', `/build/artifact/${sessionId}/${entry}`);
  return r.status === 200 ? r.text : null;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------
async function openRepo(expectMarker) {
  const t0 = nowMs();
  const init = await api('POST', '/build/init', { owner: OWNER, repo: REPO, defaultBranch: 'main' });
  if (init.status !== 200) return { ok: false, error: `init ${init.status}: ${init.text.slice(0, 200)}`, totalMs: nowMs() - t0 };
  const sessionId = init.json.sessionId;
  const result = init.json.building ? await waitForDone(sessionId) : init.json;
  const tBuilt = nowMs();
  const entry = VERIFY_FILE;
  const body = result.success ? await fetchArtifact(sessionId, entry) : null;
  const t1 = nowMs();
  const ok = result.success === true && body !== null;
  return {
    ok,
    sessionId,
    fromCache: result.fromCache === true,
    buildType: result.buildType,
    entry,
    initMs: init.ms,
    buildWaitMs: tBuilt - t0 - init.ms,
    fetchMs: t1 - tBuilt,
    totalMs: t1 - t0,
    bodyHash: body ? sha256(body) : null,
    markerFound: expectMarker && body ? body.includes(expectMarker) : null,
    error: ok ? undefined : `success=${result.success} stderr=${String(result.stderr ?? '').slice(-200)}`,
  };
}

/** Waits until the session's build container has no build running (only one build per repo may run at a time). */
async function waitContainerIdle(sessionId, timeoutMs = 180_000) {
  const name = `proofdesk-build-${sessionId}`;
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    const busy = await run('docker', ['exec', name, 'pgrep', '-f', 'docker-entrypoint.sh']);
    if (busy.code !== 0) return true; // no matching process: idle (or the container is gone)
    await sleep(250);
  }
  return false;
}

/** Creates the public share link for a session and captures how the unedited build is published. */
async function capturePublic(sessionId, files) {
  const share = await api('POST', `/build/share/${sessionId}`, { entryFile: VERIFY_FILE });
  if (share.status !== 200) throw new Error(`share ${share.status}`);
  const token = share.json.token;
  const pages = {};
  for (const file of files) {
    const res = await fetch(`${BASE}/shared/${token}/${file}`);
    pages[file] = res.status === 200 ? await res.text() : null;
  }
  return { token, pages };
}

/**
 * Edit a file and wait for it to be PUBLISHED. The clock stops when the public page (no
 * credentials) shows the change, not when the API says it is done: POST /build/update can
 * answer before the rebuild has run, so its response time is recorded but not trusted.
 *
 * Correctness is judged against how this same build was published before the edit. The share
 * route rewrites HTML, so a published page is not byte-identical to its source; instead the
 * edited public page must equal the earlier public rendering plus exactly the edit, and the
 * other page must be unchanged.
 */
async function editAndPublish(sessionId, filePath, content, marker, before, otherFile) {
  const t0 = nowMs();
  const update = await api('POST', '/build/update', { sessionId, filePath, content });
  const tUpdate = nowMs();
  const url = (file) => `${BASE}/shared/${before.token}/${file}`;

  let attempts = 0;
  let prematureResponse = null;
  let page = '';
  let seen = false;
  const deadline = nowMs() + BUILD_TIMEOUT_MS;
  while (nowMs() < deadline) {
    attempts += 1;
    const res = await fetch(url(VERIFY_FILE));
    page = res.status === 200 ? await res.text() : '';
    if (prematureResponse === null) prematureResponse = !page.includes(marker); // change not live when the API answered
    if (page.includes(marker)) { seen = true; break; }
    await sleep(100);
  }
  if (!seen) {
    return { ok: false, error: 'the change never appeared on the public page', updateHttpStatus: update.status, updateMs: tUpdate - t0, pollAttempts: attempts, prematureResponse, totalMs: nowMs() - t0 };
  }

  const other = await fetch(url(otherFile));
  const otherBody = other.status === 200 ? await other.text() : null;
  const tDone = nowMs();
  const expected = before.pages[VERIFY_FILE].replace('</body>', `<p data-bench>${marker}</p>\n</body>`);
  const editedExact = page === expected;
  const otherIntact = otherBody !== null && otherBody === before.pages[otherFile];
  return {
    ok: editedExact && otherIntact,
    updateHttpStatus: update.status,
    updateMs: tUpdate - t0,
    prematureResponse,
    pollAttempts: attempts,
    editedPageExact: editedExact,
    otherPageIntact: otherIntact,
    totalMs: tDone - t0,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proofdesk-server-bench-'));
  const env = await captureEnvironment({ repoRoot, contentDir: CONTENT, image: IMAGE, deviations: DEVIATIONS });
  env.benchmark = {
    script: 'server.mjs', runsPerCondition: RUNS, seed: SEED, port: PORT, editFile: EDIT_FILE, primaryMetric: 'totalMs',
    queue: USE_REDIS ? `BullMQ on Redis (${REDIS_IMAGE}, as in docker-compose.yml)` : 'in-process queue (no Redis)', netHost: NET_HOST,
    notes: [
      'GitHub replaced by a local bare repository through a git insteadOf rule: ls-remote and clone run for real, without network latency.',
      'GITHUB_PERSONAL_TOKEN unset: the GitHub-Releases pretex cache restore/save step is disabled.',
      'ENABLE_LOCAL_TEST_MODE=true only to disable the init rate limiter; the benchmark repo does not match the demo repo, so the production Docker path runs.',
    ],
    comparisons: [
      ['open-miss-cold', 'open-hit', 'Opening a repo: full build in a new container vs build-cache hit'],
      ['open-miss-cold', 'edit-publish-verified', 'Open (new container, full build) vs edit-to-verified-publication (running container)'],
    ],
  };
  fs.writeFileSync(path.join(OUT, 'environment.json'), JSON.stringify(env, null, 2));
  const results = openResults(OUT, 'server');

  const redisName = `bench-redis-${process.pid}`;
  if (USE_REDIS) {
    const started = await run('docker', ['run', '-d', '--name', redisName, '--network', 'host', REDIS_IMAGE, 'redis-server', '--port', String(REDIS_PORT), '--save', '', '--appendonly', 'no']);
    if (started.code !== 0) throw new Error(`could not start redis: ${started.stderr}`);
    for (let i = 0; i < 30; i += 1) {
      const ping = await run('docker', ['exec', redisName, 'redis-cli', '-p', String(REDIS_PORT), 'ping']);
      if (ping.stdout.trim() === 'PONG') break;
      await sleep(300);
    }
  }
  const remote = await makeRemote(root);
  const backend = await startBackend(root, remote);
  console.log(`[server] backend up on ${BASE}; output ${OUT}`);

  try {
    const OTHER_PAGE = args['other-page'] ?? 'demos/cover.html';
    for (let cycle = 0; cycle < RUNS; cycle += 1) {
      const cycleSessions = [];
      const marker = `bench-${cycle}-${Date.now()}`;
      const commit = await pushNewCommit(remote, marker);
      const record = (r) => {
        results.append(r);
        console.log(`[server] ${cycle + 1}/${RUNS} ${r.condition.padEnd(24)} ${Math.round(r.totalMs ?? 0)} ms ${r.correct ? 'ok' : 'PROBLEM: ' + (r.error ?? 'verification failed')}`);
      };

      // 1. Open at a new commit: build-cache miss, brand-new container, full build.
      const miss = await openRepo(marker);
      const missCorrect = miss.ok && miss.markerFound === true;
      record({ condition: 'open-miss-cold', cycle, commit, correct: missCorrect, ...miss });
      if (!miss.sessionId) continue;
      cycleSessions.push(miss.sessionId);
      await waitContainerIdle(miss.sessionId);

      // 2. Open the same commit again: should be served from the build cache.
      const hit = await openRepo(marker);
      if (hit.sessionId) cycleSessions.push(hit.sessionId);
      record({ condition: 'open-hit', cycle, commit, correct: hit.ok && hit.fromCache === true && hit.bodyHash === miss.bodyHash, ...hit });

      // 3. Edit in the first session (its container is already running) and publish.
      //    The public link is stable across edits, so it is created once, before the edit.
      const currentContent = fs.readFileSync(path.join(remote.work, EDIT_FILE), 'utf-8');
      const editMarker = `edited-${cycle}-${Date.now()}`;
      const before = await capturePublic(miss.sessionId, [VERIFY_FILE, OTHER_PAGE]);
      if (before.pages[VERIFY_FILE] === null || !before.pages[VERIFY_FILE].includes(marker)) {
        record({ condition: 'edit-publish-verified', cycle, commit, correct: false, error: 'the unedited build was not published correctly', totalMs: 0 });
      } else {
        const pub = await editAndPublish(miss.sessionId, EDIT_FILE, editContent(currentContent, editMarker), editMarker, before, OTHER_PAGE);
        record({ condition: 'edit-publish-verified', cycle, commit, correct: pub.ok === true, ...pub });
      }
      await waitContainerIdle(miss.sessionId);

      // 4. Cache-correctness probe (every 5th cycle, untimed): a NEW session at the same commit
      //    must see the committed content, not the other session's unsaved edit.
      if (cycle % 5 === 0) {
        const probe = await openRepo(editMarker);
        if (probe.sessionId) cycleSessions.push(probe.sessionId);
        const leaked = probe.markerFound === true;
        results.append({
          condition: 'cache-probe-after-edit', cycle, commit, ok: probe.ok, correct: probe.ok && leaked === false,
          fromCache: probe.fromCache, otherSessionsUnsavedEditVisible: leaked, totalMs: probe.totalMs,
        });
        console.log(`[server] ${cycle + 1}/${RUNS} cache-probe: fromCache=${probe.fromCache}, another session's UNSAVED edit visible=${leaked}`);
        if (probe.sessionId) await waitContainerIdle(probe.sessionId);
      }

      for (const id of cycleSessions) {
        await api('POST', '/build/cleanup', { sessionId: id }).catch(() => {});
      }
    }
  } finally {
    backend.kill('SIGTERM');
    await sleep(500);
    if (USE_REDIS) await run('docker', ['rm', '-f', redisName]);
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(`[server] done: ${results.file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
