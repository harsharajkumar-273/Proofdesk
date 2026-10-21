// Shared helpers for the Docker-pipeline benchmarks: timing, statistics,
// run-order randomisation, result files and environment capture.
//
// Statistics conventions (also stated in README.md, so a reader can recompute):
//   median : the middle value; for an even n, the mean of the two middle values
//   p95    : nearest-rank, sorted[ceil(0.95 * n) - 1]. With n = 50 that is the
//            48th smallest value, i.e. it is decided by the three slowest runs,
//            so it is noisy. Every summary therefore also carries a bootstrap
//            95% confidence interval.
//   Failed runs are counted and reported, and are EXCLUDED from the timing
//   statistics (a failure that returns early would otherwise look "fast").

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const nowMs = () => Number(process.hrtime.bigint()) / 1e6;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs a program without a shell and returns its output and wall-clock time. */
export function run(cmd, args = [], { cwd, env, timeoutMs = 10 * 60_000 } = {}) {
  return new Promise((resolve) => {
    const started = nowMs();
    const child = spawn(cmd, args, { cwd, env: env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(error), ms: nowMs() - started, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? -2 : code, stdout, stderr, ms: nowMs() - started, timedOut });
    });
  });
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------
export const sortAsc = (values) => [...values].sort((a, b) => a - b);

export function median(values) {
  const s = sortAsc(values);
  if (s.length === 0) return NaN;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function percentile(values, p) {
  const s = sortAsc(values);
  if (s.length === 0) return NaN;
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

// Small seeded PRNG so shuffles and bootstrap intervals are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Percentile-bootstrap confidence interval for any statistic of one sample. */
export function bootstrapCI(values, statistic, { iterations = 2000, seed = 12345, alpha = 0.05 } = {}) {
  if (values.length < 2) return [NaN, NaN];
  const rand = mulberry32(seed);
  const stats = [];
  for (let i = 0; i < iterations; i += 1) {
    const sample = Array.from({ length: values.length }, () => values[Math.floor(rand() * values.length)]);
    stats.push(statistic(sample));
  }
  return [percentile(stats, (alpha / 2) * 100), percentile(stats, (1 - alpha / 2) * 100)];
}

export function summarize(values) {
  if (values.length === 0) return { n: 0 };
  const round = (x) => Math.round(x * 100) / 100;
  const [medLo, medHi] = bootstrapCI(values, median);
  const [p95Lo, p95Hi] = bootstrapCI(values, (v) => percentile(v, 95));
  return {
    n: values.length,
    median: round(median(values)),
    medianCI95: [round(medLo), round(medHi)],
    p95: round(percentile(values, 95)),
    p95CI95: [round(p95Lo), round(p95Hi)],
    mean: round(mean(values)),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
  };
}

/**
 * Bootstrap CI for (median of A) - (median of B), resampling the two samples
 * independently. If the interval excludes 0 the difference is unlikely to be noise.
 */
export function medianDifferenceCI(a, b, { iterations = 2000, seed = 777, alpha = 0.05 } = {}) {
  if (a.length < 2 || b.length < 2) return [NaN, NaN];
  const rand = mulberry32(seed);
  const draw = (values) => Array.from({ length: values.length }, () => values[Math.floor(rand() * values.length)]);
  const diffs = [];
  for (let i = 0; i < iterations; i += 1) diffs.push(median(draw(a)) - median(draw(b)));
  return [percentile(diffs, (alpha / 2) * 100), percentile(diffs, (1 - alpha / 2) * 100)];
}

// ---------------------------------------------------------------------------
// Run order
// ---------------------------------------------------------------------------
export function shuffle(items, rand) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Block-randomised order: every block contains each condition exactly once, in
 * a random order. Conditions are therefore interleaved over the whole session,
 * so slow drift (disk cache warm-up, noisy neighbours, thermal throttling)
 * cannot systematically favour whichever condition happened to run first.
 */
export function blockRandomOrder(conditions, blocks, seed) {
  const rand = mulberry32(seed);
  const order = [];
  for (let b = 0; b < blocks; b += 1) {
    for (const condition of shuffle(conditions, rand)) order.push({ block: b, condition });
  }
  return order;
}

// ---------------------------------------------------------------------------
// Results and environment
// ---------------------------------------------------------------------------
export function openResults(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.jsonl`);
  return {
    file,
    append(record) {
      fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
    },
  };
}

export function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function sha256OfTree(root, { ignore = ['.git'] } = {}) {
  const hash = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignore.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        hash.update(path.relative(root, full));
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(root);
  return hash.digest('hex');
}

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

const firstLine = async (cmd, args, options) => (await run(cmd, args, options)).stdout.trim().split('\n')[0] ?? '';

/** Everything needed to interpret (or reproduce) a result file. */
export async function captureEnvironment({ repoRoot, contentDir, image, deviations = [] }) {
  const cpus = os.cpus();
  const dockerInfo = await run('docker', ['info', '--format', '{{json .}}']);
  let docker = {};
  try {
    const info = JSON.parse(dockerInfo.stdout);
    docker = {
      serverVersion: info.ServerVersion,
      storageDriver: info.Driver,
      cgroupVersion: info.CgroupVersion,
      cpus: info.NCPU,
      memTotalBytes: info.MemTotal,
      operatingSystem: info.OperatingSystem,
    };
  } catch {
    docker = { error: 'docker info unavailable' };
  }
  const imageInspect = await run('docker', ['image', 'inspect', image, '--format', '{{.Id}} {{.Size}} {{.Created}}']);
  const [imageId, imageSize, imageCreated] = imageInspect.stdout.trim().split(' ');
  return {
    capturedAt: new Date().toISOString(),
    git: {
      commit: await firstLine('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }),
      branch: await firstLine('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot }),
      dirty: (await firstLine('git', ['status', '--porcelain'], { cwd: repoRoot })) !== '',
    },
    content: {
      dir: path.relative(repoRoot, contentDir),
      sha256: sha256OfTree(contentDir),
      files: fs.readdirSync(contentDir),
      bytes: fs.readdirSync(contentDir).reduce((sum, f) => sum + fs.statSync(path.join(contentDir, f)).size, 0),
    },
    host: {
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpuModel: cpus[0]?.model,
      cpuCount: cpus.length,
      memTotalMB: Math.round(os.totalmem() / 1048576),
      loadAvgAtStart: os.loadavg(),
      node: process.version,
    },
    docker,
    image: { name: image, id: imageId, sizeBytes: Number(imageSize), created: imageCreated },
    deviationsFromProduction: deviations,
  };
}
