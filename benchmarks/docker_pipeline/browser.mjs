#!/usr/bin/env node
// Browser-preview benchmark: the in-browser XML -> HTML preview (Pyodide), the
// path an author gets without waiting for any container.
//
//   browser-cold          a brand-new browser context for every run, so Pyodide must be
//                         loaded and initialised: the first preview of a visit
//   browser-warm-changed  the same open editor, edit the document, click Build Preview
//   browser-cold-noprewarm  like browser-cold, but the Pyodide download is held back during page
//                         load and released at the moment of the click: what the first preview
//                         would cost WITHOUT the background pre-warm the editor starts on mount
//                         (EditorPage.tsx: "pre-warm the Pyodide WebAssembly runtime")
//
// The timed interval is the one the existing benchmark uses: click "Build Preview"
// until the new content is visible in the preview iframe. There is no content cache
// in this path (wasmCompiler.ts recompiles every time), so an "unchanged content"
// condition would not be a different code path and is deliberately not included.
//
// The Pyodide runtime is normally fetched from cdn.jsdelivr.net. Here the same
// version (0.25.0) is served from a local directory by intercepting those URLs, so
// the "cold" number EXCLUDES network transfer of ~12 MB and is a lower bound for a
// first-ever visit on a real connection.
//
// Usage: node browser.mjs --pyodide-dir <dir with pyodide.js> --runs 50 --out results/<name>

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { blockRandomOrder, captureEnvironment, nowMs, openResults, run, sleep } from './lib.mjs';

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
const BACKEND_PORT = Number(args['backend-port'] ?? 4180);
const FRONTEND_PORT = Number(args['frontend-port'] ?? 4181);
const PYODIDE_DIR = path.resolve(args['pyodide-dir'] ?? '');
const CHROMIUM = args.chromium ?? process.env.CHROMIUM_PATH ?? undefined;
const OUT = path.resolve(args.out ?? path.join(here, 'results', new Date().toISOString().replace(/[:.]/g, '-')));
const DEVIATIONS = args.deviations ? JSON.parse(fs.readFileSync(args.deviations, 'utf-8')) : [];
const SKIP_BUILD = args['skip-build'] === 'true';
const CONTENT = path.join(repoRoot, 'test-repo/course-demo');
const FRONT = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACK = `http://127.0.0.1:${BACKEND_PORT}`;

const CDN_PREFIX = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/';
const MIME = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.zip': 'application/zip', '.json': 'application/json' };

const documentWithMarker = (marker) => `<course title="Linear Algebra Demo" subtitle="A seeded repository for local product testing">
  <section title="Vectors">
    <paragraph>${marker}</paragraph>
    <paragraph>Edit this XML file to test full preview rebuilds without GitHub.</paragraph>
    <item>Represent vectors as ordered lists of numbers.</item>
  </section>
  <section title="Matrices">
    <paragraph>Matrices organize coefficients so we can describe systems and transformations.</paragraph>
    <item>Use styles.css to test quick asset updates.</item>
  </section>
</course>`;

// ---------------------------------------------------------------------------
// Stack: backend in local-test mode (the demo repo) + the built frontend.
// ---------------------------------------------------------------------------
async function waitHttp(url, label, child) {
  for (let i = 0; i < 160; i += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    if (child && child.exitCode !== null) throw new Error(`${label} exited early`);
    await sleep(500);
  }
  throw new Error(`${label} did not start`);
}

async function startStack() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofdesk-browser-bench-'));
  const log = fs.openSync(path.join(OUT, 'stack.log'), 'w');
  const backend = spawn('node', ['--import', 'tsx', 'src/server.ts'], {
    cwd: path.join(repoRoot, 'backend'),
    detached: true, // own process group, so the whole tree can be stopped at the end
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT), FRONTEND_URL: FRONT, PROOFDESK_DATA_DIR: dataDir,
      PROOFDESK_SESSION_SECRET: 'benchmark-secret', ENABLE_LOCAL_TEST_MODE: 'true', LOCAL_TEST_TOKEN: 'local-test',
      LOCAL_TEST_REPO_OWNER: 'demo', LOCAL_TEST_REPO_NAME: 'course-demo', LOCAL_TEST_REPO_PATH: CONTENT, ALLOW_TEST_SESSION_AUTH: 'true',
    },
  });
  if (!SKIP_BUILD) {
    console.log('[browser] building the frontend (local-test mode)...');
    const build = await run('npm', ['run', 'build', '--prefix', path.join(repoRoot, 'frontend')], {
      env: {
        ...process.env, VITE_ENABLE_LOCAL_TEST_MODE: 'true', VITE_BACKEND_URL: BACK, VITE_LOCAL_TEST_TOKEN: 'local-test',
        VITE_LOCAL_TEST_REPO_OWNER: 'demo', VITE_LOCAL_TEST_REPO_NAME: 'course-demo',
      },
    });
    if (build.code !== 0) throw new Error(`frontend build failed:\n${build.stderr.slice(-800)}`);
  }
  const frontend = spawn('npm', ['run', 'preview', '--prefix', path.join(repoRoot, 'frontend'), '--', '--host', '127.0.0.1', '--port', String(FRONTEND_PORT), '--strictPort'], {
    detached: true,
    stdio: ['ignore', log, log],
  });
  await waitHttp(`${BACK}/health`, 'backend', backend);
  await waitHttp(FRONT, 'frontend', frontend);
  return { backend, frontend, dataDir };
}

// ---------------------------------------------------------------------------
// Driving the editor (same hooks and selectors as benchmarks/compile_latency.spec.ts)
// ---------------------------------------------------------------------------
async function newPage(browser, { gated = false } = {}) {
  const context = await browser.newContext();
  const pyodideRequests = { count: 0, bytes: 0 };
  let openGate = () => {};
  const gate = gated ? new Promise((resolve) => { openGate = resolve; }) : null;
  await context.route(`${CDN_PREFIX}**`, async (route) => {
    if (gate) await gate; // hold the Pyodide download until the benchmark releases it
    const file = path.join(PYODIDE_DIR, new URL(route.request().url()).pathname.replace('/pyodide/v0.25.0/full/', ''));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    const body = fs.readFileSync(file);
    pyodideRequests.count += 1;
    pyodideRequests.bytes += body.length;
    return route.fulfill({ status: 200, body, headers: { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' } });
  });
  await context.addInitScript(() => {
    window.__MRA_TEST__ = true;
    window.localStorage.setItem('proofdesk_tour_v1', '1');
  });
  const page = await context.newPage();
  const timing = { navigationStart: null, prewarmReadyAt: null };
  page.on('console', (message) => {
    if (message.text().includes('Pyodide compiler runtime pre-warmed successfully')) timing.prewarmReadyAt = nowMs();
  });
  return { context, page, pyodideRequests, openGate, timing };
}

async function openWorkspace(page) {
  await page.goto(`${FRONT}/`);
  await page.getByTestId('local-demo-login').click();
  await page.getByRole('navigation').getByRole('link', { name: /open workspace/i }).waitFor({ timeout: 30_000 });
  await page.goto(`${FRONT}/workspace`);
  await page.getByTestId('open-demo-workspace').waitFor();
  await Promise.all([page.waitForURL('**/editor'), page.getByTestId('open-demo-workspace').click()]);
  await page.getByTestId('build-repository-button').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const snap = window.__mraWorkspaceSnapshot;
    return snap && snap.loading === false && snap.filePaths.includes('course.xml');
  }, null, { timeout: 45_000 });
  await page.locator('select[title*="WASM Sandbox"]').selectOption('wasm');
  await page.locator('[data-file-path="course.xml"]').click();
  await page.waitForFunction(() => typeof window.__mraSetActiveEditorValue === 'function' && window.__mraIsActiveEditorReady === true, null, { timeout: 45_000 });
}

/** One timed preview: set the editor content, click Build Preview, wait for it to appear. */
async function timedPreview(page, marker, { beforeClick } = {}) {
  await page.evaluate((value) => window.__mraSetActiveEditorValue(value), documentWithMarker(marker));
  const frame = page.frameLocator('iframe[title="Build Preview"]');
  const started = nowMs();
  if (beforeClick) beforeClick();
  await page.getByRole('button', { name: /build preview|building/i }).first().click();
  await frame.getByText(marker).waitFor({ state: 'visible', timeout: 60_000 });
  const totalMs = nowMs() - started;
  // Correctness: the rendered preview must contain the whole document, not just the marker.
  const text = await frame.locator('body').innerText();
  // The in-browser transformer renders the body text but not the section `title=` attributes of
  // this toy schema (the server build does), so titles are recorded, not required.
  const expectedInOrder = [
    marker,
    'Edit this XML file to test full preview rebuilds without GitHub.',
    'Represent vectors as ordered lists of numbers.',
    'Matrices organize coefficients so we can describe systems and transformations.',
    'Use styles.css to test quick asset updates.',
  ];
  let cursor = -1;
  const correct = expectedInOrder.every((needle) => {
    const at = text.indexOf(needle, cursor + 1);
    cursor = at;
    return at !== -1;
  });
  const sectionTitlesRendered = text.includes('Vectors') && text.includes('Matrices');
  return { totalMs, correct, sectionTitlesRendered, renderedChars: text.length, renderedSample: correct ? undefined : text.slice(0, 400) };
}

async function main() {
  if (!PYODIDE_DIR || !fs.existsSync(path.join(PYODIDE_DIR, 'pyodide.js'))) throw new Error('--pyodide-dir must contain pyodide.js (npm pack pyodide@0.25.0)');
  fs.mkdirSync(OUT, { recursive: true });
  const env = await captureEnvironment({ repoRoot, contentDir: CONTENT, image: 'none', deviations: DEVIATIONS });
  env.benchmark = {
    script: 'browser.mjs', runsPerCondition: RUNS, seed: SEED, primaryMetric: 'totalMs', editFile: 'course.xml',
    notes: ['Pyodide 0.25.0 served from local disk by request interception; the cdn.jsdelivr.net download time is excluded.'],
    comparisons: [
      ['browser-cold-noprewarm', 'browser-cold', 'What the background pre-warm saves on the first preview (not pre-warmed vs pre-warmed)'],
      ['browser-cold', 'browser-warm-changed', 'First preview of a visit (pre-warmed) vs later previews'],
      ['browser-cold-noprewarm', 'browser-warm-changed', 'First preview of a visit without pre-warm vs later previews'],
    ],
  };
  const stack = await startStack();
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  env.browser = { name: 'chromium', version: browser.version() };
  fs.writeFileSync(path.join(OUT, 'environment.json'), JSON.stringify(env, null, 2));
  const results = openResults(OUT, 'browser');
  console.log(`[browser] stack up; output ${OUT}`);

  // One long-lived page for the warm condition, primed with an unmeasured preview.
  const warm = await newPage(browser);
  await openWorkspace(warm.page);
  await timedPreview(warm.page, `prime-${Date.now()}`);

  try {
    let index = 0;
    for (const { block, condition } of blockRandomOrder(['browser-cold', 'browser-cold-noprewarm', 'browser-warm-changed'], RUNS, SEED)) {
      index += 1;
      const marker = `bench-${condition}-${block}-${Date.now()}`;
      let record;
      try {
        if (condition === 'browser-cold' || condition === 'browser-cold-noprewarm') {
          const gated = condition === 'browser-cold-noprewarm';
          const cold = await newPage(browser, { gated });
          const t0 = nowMs();
          await openWorkspace(cold.page);
          const pageReadyMs = nowMs() - t0;
          // With the pre-warm running normally, how long after navigation did Pyodide become ready?
          const prewarmReadyMs = cold.timing.prewarmReadyAt ? cold.timing.prewarmReadyAt - t0 : null;
          const r = await timedPreview(cold.page, marker, { beforeClick: gated ? cold.openGate : undefined });
          record = {
            condition, block, index, ok: true, correct: r.correct, ...r, pageReadyMs, prewarmReadyMs,
            pyodideReadyBeforeClick: !gated && prewarmReadyMs !== null,
            pyodideRequests: cold.pyodideRequests.count, pyodideBytes: cold.pyodideRequests.bytes,
          };
          await cold.context.close();
        } else {
          const r = await timedPreview(warm.page, marker);
          record = { condition, block, index, ok: true, correct: r.correct, ...r };
        }
      } catch (error) {
        record = { condition, block, index, ok: false, correct: false, error: String(error).slice(0, 300) };
      }
      results.append(record);
      console.log(`[browser] ${String(index).padStart(3)}/${RUNS * 3} ${condition.padEnd(22)} ${record.totalMs ? Math.round(record.totalMs) + ' ms' : 'n/a'} ${record.ok ? (record.correct ? 'ok' : 'INCORRECT-OUTPUT') : 'FAILED ' + record.error}`);
    }
  } finally {
    await browser.close();
    for (const child of [stack.backend, stack.frontend]) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
    }
    await sleep(500);
    fs.rmSync(stack.dataDir, { recursive: true, force: true });
  }
  console.log(`[browser] done: ${results.file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
