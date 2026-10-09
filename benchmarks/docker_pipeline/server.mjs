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
import { captureEnvironment, mulberry32, nowMs, openResults, run, shuffle, sha256, sleep } from './lib.mjs';

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
  delete env.GITHUB_PERSONAL_TOKEN; // keep the GitHub-releases cache step out of the measurement
  delete env.PROOFDESK_REDIS_URL;
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

async function editAndPublish(sessionId, filePath, content, expectMarker) {
  const t0 = nowMs();
  const update = await api('POST', '/build/update', { sessionId, filePath, content });
  const t1 = nowMs();
  if (update.status !== 200 || update.json?.success !== true) {
    return { ok: false, error: `update ${update.status}: ${update.text.slice(0, 200)}`, updateMs: t1 - t0, totalMs: t1 - t0 };
  }
  const entry = VERIFY_FILE;
  const share = await api('POST', `/build/share/${sessionId}`, { entryFile: entry });
  const t2 = nowMs();
  if (share.status !== 200) return { ok: false, error: `share ${share.status}`, updateMs: t1 - t0, shareMs: t2 - t1, totalMs: t2 - t0 };
  // The public link is what a reader opens; it needs no credentials.
  const publicRes = await fetch(`${BASE}/shared/${share.json.token}/${entry}`);
  const publicBody = await publicRes.text();
  const t3 = nowMs();
  return {
    ok: publicRes.status === 200,
    entry,
    updateMs: t1 - t0,
    shareMs: t2 - t1,
    publishedFetchMs: t3 - t2,
    totalMs: t3 - t0,
    bodyHash: sha256(publicBody),
    markerFound: expectMarker ? publicBody.includes(expectMarker) : null,
    publishedStatus: publicRes.status,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proofdesk-server-bench-'));
  const env = await captureEnvironment({ repoRoot, contentDir: CONTENT, image: IMAGE, deviations: DEVIATIONS });
  env.benchmark = {
    script: 'server.mjs', runsPerCondition: RUNS, seed: SEED, port: PORT, editFile: EDIT_FILE, primaryMetric: 'totalMs',
    notes: [
      'GitHub replaced by a local bare repository through a git insteadOf rule: ls-remote and clone run for real, without network latency.',
      'GITHUB_PERSONAL_TOKEN unset: the GitHub-Releases pretex cache restore/save step is disabled.',
      'ENABLE_LOCAL_TEST_MODE=true only to disable the init rate limiter; the benchmark repo does not match the demo repo, so the production Docker path runs.',
    ],
    comparisons: [
      ['open-miss-cold', 'open-hit', 'Opening a repo: rebuild in a new container vs build-cache hit'],
      ['open-miss-cold', 'edit-publish-changed', 'Cold container (open, miss) vs running container (edit, rebuild)'],
      ['edit-publish-changed', 'edit-publish-unchanged', 'Edit with changed content vs identical content (running container)'],
    ],
  };
  fs.writeFileSync(path.join(OUT, 'environment.json'), JSON.stringify(env, null, 2));
  const results = openResults(OUT, 'server');

  const remote = await makeRemote(root);
  const backend = await startBackend(root, remote);
  console.log(`[server] backend up on ${BASE}; output ${OUT}`);
  const rand = mulberry32(SEED);
  const sessions = [];

  try {
    for (let cycle = 0; cycle < RUNS; cycle += 1) {
      const marker = `bench-${cycle}-${Date.now()}`;
      const commit = await pushNewCommit(remote, marker);

      // 1. Open at a new commit: cache miss, new container.
      const miss = await openRepo(marker);
      const missCorrect = miss.ok && miss.markerFound === true;
      results.append({ condition: 'open-miss-cold', cycle, commit, correct: missCorrect, ...miss });
      console.log(`[server] ${cycle + 1}/${RUNS} open-miss-cold ${Math.round(miss.totalMs)} ms ${missCorrect ? 'ok' : 'PROBLEM: ' + (miss.error ?? 'marker missing')}`);
      if (!miss.sessionId) continue;
      sessions.push(miss.sessionId);
      const goldenHash = miss.bodyHash;

      const filePath = EDIT_FILE;
      const currentContent = fs.readFileSync(path.join(remote.work, EDIT_FILE), 'utf-8');
      const editMarker = `edited-${cycle}-${Date.now()}`;

      // 2-4 in random order: cache hit, edit with changed content, edit with identical content.
      const steps = shuffle(['open-hit', 'edit-publish-changed', 'edit-publish-unchanged'], rand);
      for (const step of steps) {
        let record;
        if (step === 'open-hit') {
          const hit = await openRepo(marker);
          if (hit.sessionId) sessions.push(hit.sessionId);
          // A hit must serve exactly what was built for this commit.
          const correct = hit.ok && hit.fromCache === true && hit.bodyHash === goldenHash;
          record = { condition: step, cycle, commit, correct, ...hit };
        } else if (step === 'edit-publish-changed') {
          const edited = editContent(currentContent, editMarker);
          const r = await editAndPublish(miss.sessionId, filePath, edited, editMarker);
          record = { condition: step, cycle, commit, correct: r.ok && r.markerFound === true, ...r };
        } else {
          const r = await editAndPublish(miss.sessionId, filePath, currentContent, null);
          record = { condition: step, cycle, commit, correct: r.ok, ...r };
        }
        results.append(record);
        console.log(`[server] ${cycle + 1}/${RUNS} ${step} ${Math.round(record.totalMs)} ms ${record.correct ? 'ok' : 'PROBLEM: ' + (record.error ?? 'verification failed')}`);
      }

      // Cache-correctness probe (every 10th cycle, outside the timed conditions):
      // after an edit in one session, does a NEW session at the same commit see
      // the committed content, or the other session's unsaved edit?
      if (cycle % 10 === 0) {
        const probe = await api('POST', '/build/init', { owner: OWNER, repo: REPO, defaultBranch: 'main' });
        let leaked = null;
        if (probe.status === 200) {
          const res = probe.json.building ? await waitForDone(probe.json.sessionId) : probe.json;
          const body = res.success ? await fetchArtifact(probe.json.sessionId, VERIFY_FILE) : null;
          leaked = body ? body.includes(editMarker) : null;
          sessions.push(probe.json.sessionId);
          results.append({ condition: 'cache-probe-after-edit', cycle, ok: true, correct: leaked === false, fromCache: res.fromCache === true, otherSessionsUnsavedEditVisible: leaked, totalMs: probe.ms });
          console.log(`[server] ${cycle + 1}/${RUNS} cache-probe: fromCache=${res.fromCache === true}, other session's unsaved edit visible=${leaked}`);
        }
      }
    }
  } finally {
    for (const id of sessions) await api('POST', '/build/cleanup', { sessionId: id }).catch(() => {});
    backend.kill('SIGTERM');
    await sleep(500);
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(`[server] done: ${results.file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
