#!/usr/bin/env node
// Turns raw per-run records (*.jsonl) into the tables the report needs:
// per condition: runs, failures, incorrect outputs, median and p95 with
// bootstrap confidence intervals; plus the requested head-to-head comparisons
// with a confidence interval for the difference of medians.
//
// Usage: node analyze.mjs <results-dir>

import fs from 'node:fs';
import path from 'node:path';
import { medianDifferenceCI, median, readJsonl, summarize } from './lib.mjs';

const dir = path.resolve(process.argv[2] ?? '.');
const envFile = path.join(dir, 'environment.json');
const env = fs.existsSync(envFile) ? JSON.parse(fs.readFileSync(envFile, 'utf-8')) : {};
const primary = env.benchmark?.primaryMetric ?? 'totalMs';
const comparisons = env.benchmark?.comparisons ?? [];

const fmt = (x) => (Number.isFinite(x) ? (x >= 1000 ? `${Math.round(x).toLocaleString('en-US')}` : x.toFixed(1)) : 'n/a');
const ci = (pair) => `[${fmt(pair?.[0])}, ${fmt(pair?.[1])}]`;

const lines = [];
const json = { directory: dir, primaryMetric: primary, files: {} };

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
  const records = readJsonl(path.join(dir, file));
  const byCondition = new Map();
  for (const r of records) {
    if (!byCondition.has(r.condition)) byCondition.set(r.condition, []);
    byCondition.get(r.condition).push(r);
  }

  lines.push(`### ${file} (primary metric: \`${primary}\`, milliseconds)`, '');
  lines.push('| Condition | Runs | Failed | Incorrect | Median | Median 95% CI | p95 | p95 95% CI | Min | Max |');
  lines.push('|---|---:|---:|---:|---:|---|---:|---|---:|---:|');

  const stats = {};
  for (const [condition, rows] of byCondition) {
    const failed = rows.filter((r) => r.ok !== true).length;
    const incorrect = rows.filter((r) => r.ok === true && r.correct !== true).length;
    const good = rows.filter((r) => r.correct === true && Number.isFinite(r[primary])).map((r) => r[primary]);
    const s = summarize(good);
    stats[condition] = { runs: rows.length, failed, incorrect, ...s, values: good };
    lines.push(
      `| ${condition} | ${rows.length} | ${failed} | ${incorrect} | ${fmt(s.median)} | ${ci(s.medianCI95)} | ${fmt(s.p95)} | ${ci(s.p95CI95)} | ${fmt(s.min)} | ${fmt(s.max)} |`,
    );
  }
  lines.push('');

  // Where the time goes: median of each phase, for the runs that count.
  const phases = [...new Set(records.flatMap((r) => Object.keys(r).filter((k) => k.endsWith('Ms') && k !== primary)))];
  if (phases.length) {
    lines.push(`Median of each phase (ms), correct runs only:`, '', `| Condition | ${phases.join(' | ')} |`, `|---|${phases.map(() => '---:').join('|')}|`);
    for (const [condition, rows] of byCondition) {
      const good = rows.filter((r) => r.correct === true);
      lines.push(`| ${condition} | ${phases.map((p) => fmt(median(good.map((r) => r[p]).filter(Number.isFinite)))).join(' | ')} |`);
    }
    lines.push('');
  }

  const comparisonRows = [];
  for (const [a, b, description] of comparisons) {
    if (!stats[a] || !stats[b] || !stats[a].values.length || !stats[b].values.length) continue;
    const diff = stats[a].median - stats[b].median;
    const [lo, hi] = medianDifferenceCI(stats[a].values, stats[b].values);
    const tooFew = Math.min(stats[a].values.length, stats[b].values.length) < 10;
    const significant = tooFew ? null : lo > 0 || hi < 0; // null = too few runs to say
    comparisonRows.push({ a, b, description, diff, lo, hi, ratio: stats[a].median / stats[b].median, significant });
  }
  if (comparisonRows.length) {
    lines.push('Head-to-head (difference of medians, A minus B; the interval is a bootstrap 95% CI):', '');
    lines.push('| Question | A | B | A median | B median | A - B | 95% CI of A - B | A / B | Distinguishable from noise? |');
    lines.push('|---|---|---|---:|---:|---:|---|---:|---|');
    for (const c of comparisonRows) {
      lines.push(
        `| ${c.description} | ${c.a} | ${c.b} | ${fmt(stats[c.a].median)} | ${fmt(stats[c.b].median)} | ${fmt(c.diff)} | ${ci([c.lo, c.hi])} | ${c.ratio.toFixed(2)}x | ${c.significant === null ? 'too few runs (< 10)' : c.significant ? 'yes' : 'no'} |`,
      );
    }
    lines.push('');
  }

  json.files[file] = {
    conditions: Object.fromEntries(Object.entries(stats).map(([k, { values, ...rest }]) => [k, rest])),
    comparisons: comparisonRows,
  };
}

fs.writeFileSync(path.join(dir, 'summary.md'), lines.join('\n'));
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(json, null, 2));
console.log(lines.join('\n'));
