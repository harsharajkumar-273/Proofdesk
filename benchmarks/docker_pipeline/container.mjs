#!/usr/bin/env node
// Container-level benchmark: how long does the build container take, and what
// makes it faster or slower?
//
// It reproduces the docker sequence of backend/src/services/buildExecutor.ts:
//
//   new container     : docker rm -f NAME ; docker run -d NAME ... sleep infinity ;
//                       docker exec NAME /usr/local/bin/docker-entrypoint.sh build
//   running container : docker inspect -f '{{.State.Running}}' NAME ;
//                       docker exec NAME /usr/local/bin/docker-entrypoint.sh build
//
// with the same resource limits and mounts (repo, output, build, and the shared
// named volume for the pretex cache). Only the docker CLI is timed; no browser,
// HTTP server or UI is involved, so these numbers isolate the container cost.
//
// WHAT "SESSION STATE" MEANS. A session owns three bind-mounted folders: /repo,
// /output and /home/vagrant/build. The first build of a session populates them
// (npm install writes node_modules into /repo/mathbox; SCons writes its
// dependency database into the build folder). Later builds reuse that state.
// "Cold container vs already-running container" is only a clean comparison if
// the session state is held constant, which is why a *new container over the
// same session state* is its own condition below.
//
// Conditions:
//   first-build                     new container, fresh session state, cache volume populated
//   first-build-emptycache          new container, fresh session state, cache volume empty
//   rebuild-running-unchanged       already-running container, session state warm, same content
//   rebuild-running-changed         already-running container, session state warm, edited content
//   rebuild-newcontainer-unchanged  NEW container over the SAME session state, same content
//   rebuild-newcontainer-changed    NEW container over the SAME session state, edited content
//   rebuild-running-emptycache      already-running container, cache volume emptied just before
//
// Usage:
//   node container.mjs --runs 50 --out results/<name> [--seed 1] [--only a,b]
//        [--net-host] [--content <dir>] [--edit-file <path inside content>]
//
// --net-host runs containers with --network host and forwards the HTTPS proxy
// settings. It is only for environments (like a sandbox) where Docker's bridge
// network is unavailable; the build's `npm install` needs network access.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockRandomOrder, captureEnvironment, nowMs, openResults, run, sha256 } from './lib.mjs';

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
const IMAGE = args.image ?? process.env.PROOFDESK_DOCKER_IMAGE ?? 'mra-pretext-builder';
const CONTENT = path.resolve(args.content ?? path.join(repoRoot, 'backend/assets/ila-toolchain'));
const EDIT_FILE = args['edit-file'] ?? 'demos/rabbits.html'; // a straight copy into /output, so the edit is directly checkable
const EXEC_TIMEOUT_MS = Number(args['timeout-s'] ?? 900) * 1000;
const NET_HOST = args['net-host'] === 'true';
const OUT = path.resolve(args.out ?? path.join(here, 'results', new Date().toISOString().replace(/[:.]/g, '-')));
const DEVIATIONS = args.deviations ? JSON.parse(fs.readFileSync(args.deviations, 'utf-8')) : [];

const ALL_CONDITIONS = [
  'first-build',
  'first-build-emptycache',
  'rebuild-running-unchanged',
  'rebuild-running-changed',
  'rebuild-newcontainer-unchanged',
  'rebuild-newcontainer-changed',
  'rebuild-running-emptycache',
];
const CONDITIONS = args.only ? args.only.split(',') : ALL_CONDITIONS;

// Same flags as DOCKER_RESOURCE_LIMITS in buildExecutor.ts.
const LIMITS = ['--memory', '512m', '--pids-limit', '64'];
const ENTRYPOINT = '/usr/local/bin/docker-entrypoint.sh';
const RUN_ID = `bench${process.pid}`;
const SHARED_CACHE = `${RUN_ID}-cache-shared`;
const SESSION_CACHE = `${RUN_ID}-cache-session`;
const SESSION_CONTAINER = `${RUN_ID}-session`;

const networkArgs = () => {
  if (!NET_HOST) return [];
  const proxy = process.env.HTTPS_PROXY ?? '';
  const noProxy = process.env.NO_PROXY ?? '';
  return [
    '--network', 'host',
    '-e', `HTTPS_PROXY=${proxy}`, '-e', `https_proxy=${proxy}`,
    '-e', `NO_PROXY=${noProxy}`, '-e', `no_proxy=${noProxy}`,
    '-e', 'NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/proxy-ca.crt',
  ];
};

const docker = (...a) => run('docker', a);

// ---------------------------------------------------------------------------
// Content and workspaces
// ---------------------------------------------------------------------------
const originalEditSource = fs.readFileSync(path.join(CONTENT, EDIT_FILE), 'utf-8');

/** The edited file content for a marker. Pure, so the expected result can be computed independently. */
function editedContent(original, marker) {
  if (EDIT_FILE.endsWith('.html')) {
    if (!original.includes('</body>')) throw new Error(`${EDIT_FILE} has no </body> to edit`);
    return original.replace('</body>', `<p data-bench>${marker}</p>\n</body>`);
  }
  return `${original}\n// ${marker}\n`;
}

function makeWorkspace(label) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `${RUN_ID}-${label}-`));
  const ws = { base, repo: path.join(base, 'repo'), output: path.join(base, 'output'), build: path.join(base, 'build') };
  fs.cpSync(CONTENT, ws.repo, { recursive: true });
  fs.mkdirSync(ws.output, { recursive: true });
  fs.mkdirSync(ws.build, { recursive: true });
  return ws;
}

const removeWorkspace = (ws) => fs.rmSync(ws.base, { recursive: true, force: true });
const writeEdit = (ws, marker) => fs.writeFileSync(path.join(ws.repo, EDIT_FILE), marker ? editedContent(originalEditSource, marker) : originalEditSource);

function runArgs(name, ws, cacheVolume) {
  return [
    'run', '-d', '--name', name, ...LIMITS, ...networkArgs(),
    '-v', `${ws.repo}:/repo`,
    '-v', `${ws.output}:/output`,
    '-v', `${ws.build}:/home/vagrant/build`,
    '-v', `${cacheVolume}:/home/vagrant/cache`,
    IMAGE, 'sleep', 'infinity',
  ];
}

// ---------------------------------------------------------------------------
// Verification: is the published output actually correct?
// ---------------------------------------------------------------------------
function hashTree(dir) {
  const map = {};
  const walk = (d) => {
    for (const entry of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else map[path.relative(dir, full)] = sha256(fs.readFileSync(full));
    }
  };
  walk(dir);
  return map;
}

/**
 * Compares a build's output with the golden file set (the output of a first
 * build of the unedited content, which is byte-for-byte reproducible).
 *   - every golden file must be present and identical, except the edited page;
 *   - the edited page must equal exactly the expected edited content;
 *   - files that are not in the golden set (intermediate products that a rebuild
 *     leaves in /output) are allowed but counted.
 */
function verify(ws, golden, marker) {
  const out = hashTree(ws.output);
  const editedKey = EDIT_FILE; // the edit is a straight copy to the same relative path
  const expectedEditedHash = sha256(marker ? editedContent(originalEditSource, marker) : originalEditSource);
  let missing = 0;
  let mismatched = 0;
  for (const [file, hash] of Object.entries(golden)) {
    if (!(file in out)) missing += 1;
    else if (file !== editedKey && out[file] !== hash) mismatched += 1;
  }
  const editedOk = out[editedKey] === expectedEditedHash;
  const extra = Object.keys(out).filter((f) => !(f in golden)).length;
  const htmlCount = Object.keys(out).filter((f) => f.endsWith('.html')).length;
  return {
    fileCount: Object.keys(out).length,
    htmlCount,
    missingFiles: missing,
    mismatchedFiles: mismatched,
    extraFiles: extra,
    editedPageExact: editedOk,
    correctOutput: missing === 0 && mismatched === 0 && editedOk && htmlCount > 0,
  };
}

// ---------------------------------------------------------------------------
// Timed operations
// ---------------------------------------------------------------------------
async function timedNewContainerBuild({ name, ws, cacheVolume }) {
  const t0 = nowMs();
  await docker('rm', '-f', name); // buildExecutor removes any stale container first
  const started = await docker(...runArgs(name, ws, cacheVolume));
  const t1 = nowMs();
  if (started.code !== 0) return { ok: false, phase: 'start', startMs: t1 - t0, execMs: 0, totalMs: t1 - t0, error: started.stderr.slice(-300) };
  const exec = await run('docker', ['exec', name, ENTRYPOINT, 'build'], { timeoutMs: EXEC_TIMEOUT_MS });
  const t2 = nowMs();
  return { ok: exec.code === 0, phase: 'exec', startMs: t1 - t0, execMs: t2 - t1, totalMs: t2 - t0, exitCode: exec.code, timedOut: exec.timedOut, stderrTail: exec.code === 0 ? undefined : exec.stdout.slice(-300) };
}

async function timedRunningBuild({ name }) {
  const t0 = nowMs();
  const inspect = await docker('inspect', '-f', '{{.State.Running}}', name); // _ensureContainerRunning
  const t1 = nowMs();
  if (inspect.stdout.trim() !== 'true') return { ok: false, phase: 'inspect', inspectMs: t1 - t0, execMs: 0, totalMs: t1 - t0, error: 'container not running' };
  const exec = await run('docker', ['exec', name, ENTRYPOINT, 'build'], { timeoutMs: EXEC_TIMEOUT_MS });
  const t2 = nowMs();
  return { ok: exec.code === 0, phase: 'exec', inspectMs: t1 - t0, execMs: t2 - t1, totalMs: t2 - t0, exitCode: exec.code, timedOut: exec.timedOut, stderrTail: exec.code === 0 ? undefined : exec.stdout.slice(-300) };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const env = await captureEnvironment({ repoRoot, contentDir: CONTENT, image: IMAGE, deviations: DEVIATIONS });
  env.benchmark = {
    script: 'container.mjs', runsPerCondition: RUNS, seed: SEED, conditions: CONDITIONS, editFile: EDIT_FILE,
    execTimeoutMs: EXEC_TIMEOUT_MS, limits: LIMITS.join(' '), netHost: NET_HOST, primaryMetric: 'totalMs',
    comparisons: [
      ['rebuild-newcontainer-unchanged', 'rebuild-running-unchanged', 'Cold (new) container vs already-running container, same session state, same content'],
      ['rebuild-newcontainer-changed', 'rebuild-running-changed', 'Cold (new) container vs already-running container, same session state, edited content'],
      ['first-build', 'rebuild-running-unchanged', 'First build of a session vs repeated build in the running container'],
      ['first-build', 'rebuild-newcontainer-unchanged', 'First build of a session vs repeated build in a new container (session state kept)'],
      ['first-build-emptycache', 'first-build', 'Empty pretex-cache volume vs populated, on a first build'],
      ['rebuild-running-emptycache', 'rebuild-running-unchanged', 'Emptied pretex cache vs populated, on a repeated build'],
      ['rebuild-running-changed', 'rebuild-running-unchanged', 'Edited vs unchanged content (running container)'],
      ['rebuild-newcontainer-changed', 'rebuild-newcontainer-unchanged', 'Edited vs unchanged content (new container)'],
    ],
  };
  fs.writeFileSync(path.join(OUT, 'environment.json'), JSON.stringify(env, null, 2));
  const results = openResults(OUT, 'container');
  console.log(`[container] output: ${OUT}\n[container] ${CONDITIONS.length} conditions x ${RUNS} runs, seed ${SEED}, net-host=${NET_HOST}`);

  await docker('volume', 'create', SHARED_CACHE);
  await docker('volume', 'create', SESSION_CACHE);

  // Golden file set: an unmeasured first build of the unedited content.
  let golden;
  {
    const ws = makeWorkspace('golden');
    const r = await timedNewContainerBuild({ name: `${RUN_ID}-golden`, ws, cacheVolume: SHARED_CACHE });
    if (!r.ok) throw new Error(`the golden build failed (exit ${r.exitCode}): ${r.stderrTail ?? r.error}`);
    golden = hashTree(ws.output);
    fs.writeFileSync(path.join(OUT, 'golden-files.json'), JSON.stringify(golden, null, 2));
    console.log(`[container] golden build: ${Object.keys(golden).length} files in ${Math.round(r.totalMs)} ms`);
    await docker('rm', '-f', `${RUN_ID}-golden`);
    removeWorkspace(ws);
  }

  // The long-lived session used by every rebuild-* condition.
  const session = makeWorkspace('session');
  const state = { containerUp: false, lastBuilt: 'none', cachePrimed: false, builds: 0 };

  const untimed = async (label, fn) => {
    const r = await fn();
    state.builds += 1;
    if (!r.ok) console.warn(`[container] untimed ${label} failed: ${r.error ?? r.stderrTail}`);
    return r;
  };
  const startSessionContainer = () => untimed('session-start', () => timedNewContainerBuild({ name: SESSION_CONTAINER, ws: session, cacheVolume: SESSION_CACHE }));

  /** Brings the session to a defined state before a timed rebuild (not measured). */
  const prepareSession = async ({ needCache }) => {
    if (!state.containerUp) {
      writeEdit(session, null);
      await startSessionContainer(); // also performs the session's first build
      state.containerUp = true;
      state.lastBuilt = 'base';
      state.cachePrimed = true;
    }
    if (state.lastBuilt !== 'base' || (needCache && !state.cachePrimed)) {
      writeEdit(session, null);
      await untimed('session-reset', () => timedRunningBuild({ name: SESSION_CONTAINER }));
      state.lastBuilt = 'base';
      state.cachePrimed = true;
    }
  };

  const order = blockRandomOrder(CONDITIONS, RUNS, SEED);
  let index = 0;
  for (const { block, condition } of order) {
    index += 1;
    const isChanged = condition.endsWith('-changed');
    const marker = isChanged ? `bench-${condition}-${block}-${Date.now()}` : null;
    let record;
    try {
      if (condition === 'first-build' || condition === 'first-build-emptycache') {
        const ws = makeWorkspace('first');
        const name = `${RUN_ID}-first`;
        const emptyCache = condition === 'first-build-emptycache';
        const cacheVolume = emptyCache ? `${RUN_ID}-cache-fresh-${index}` : SHARED_CACHE;
        if (emptyCache) await docker('volume', 'create', cacheVolume);
        const timing = await timedNewContainerBuild({ name, ws, cacheVolume });
        record = { condition, block, index, ...timing, ...verify(ws, golden, null) };
        await docker('rm', '-f', name);
        if (emptyCache) await docker('volume', 'rm', '-f', cacheVolume);
        removeWorkspace(ws);
      } else {
        await prepareSession({ needCache: condition !== 'rebuild-running-emptycache' });
        if (condition === 'rebuild-running-emptycache') {
          await docker('exec', SESSION_CONTAINER, 'sh', '-c', 'rm -rf /home/vagrant/cache/* /home/vagrant/cache/.[!.]* 2>/dev/null; true');
          state.cachePrimed = false;
        }
        if (condition.startsWith('rebuild-newcontainer')) {
          await docker('rm', '-f', SESSION_CONTAINER); // the previous container goes away (untimed)...
          state.containerUp = false;
        }
        writeEdit(session, marker);
        const buildsBefore = state.builds;
        const timing = condition.startsWith('rebuild-newcontainer')
          ? await timedNewContainerBuild({ name: SESSION_CONTAINER, ws: session, cacheVolume: SESSION_CACHE }) // ...and a new one starts over the same session folders
          : await timedRunningBuild({ name: SESSION_CONTAINER });
        state.containerUp = true;
        state.lastBuilt = marker ? 'edited' : 'base';
        if (timing.ok) state.cachePrimed = true;
        state.builds += 1;
        record = { condition, block, index, ...timing, sessionBuildsBefore: buildsBefore, ...verify(session, golden, marker) };
      }
    } catch (error) {
      record = { condition, block, index, ok: false, phase: 'harness', error: String(error) };
    }

    // A run only counts if the build succeeded AND the published output is exactly right.
    record.correct = record.ok === true && record.correctOutput === true;
    record.marker = marker;
    results.append(record);
    console.log(
      `[container] ${String(index).padStart(3)}/${order.length} ${condition.padEnd(32)} ` +
        `${record.totalMs ? String(Math.round(record.totalMs)).padStart(6) + ' ms' : '   n/a'}  ${record.ok ? (record.correct ? 'ok' : 'INCORRECT-OUTPUT') : 'FAILED'}`,
    );
  }

  await docker('rm', '-f', SESSION_CONTAINER);
  await docker('volume', 'rm', '-f', SHARED_CACHE, SESSION_CACHE);
  removeWorkspace(session);
  console.log(`[container] done: ${results.file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
