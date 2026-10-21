#!/usr/bin/env node
// Analyses the professor's timing log (see PROFESSOR_PROTOCOL.md).
// Usage: node professor_analyze.mjs professor_log.csv
//
// Duration is T1 - T0 from the timestamps when both are present, otherwise the
// duration_s column; interruption_s is subtracted. Rows that did not end in a
// verified-correct publication are reported but excluded from the timing
// statistics (a publication that was wrong is not a finished update).

import fs from 'node:fs';
import { bootstrapCI, mulberry32, median, percentile } from './lib.mjs';

/** Minimal CSV reader: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function durationSeconds(row) {
  const t0 = Date.parse(row.t0_iso);
  const t1 = Date.parse(row.t1_iso);
  // An empty cell is "not recorded", not zero: Number('') is 0, which would count as a 0-second update.
  const recorded = String(row.duration_s ?? '').trim() === '' ? NaN : Number(row.duration_s);
  const base = Number.isFinite(t0) && Number.isFinite(t1) ? (t1 - t0) / 1000 : recorded;
  const interruption = Number(row.interruption_s || 0);
  return Number.isFinite(base) ? base - (Number.isFinite(interruption) ? interruption : 0) : NaN;
}

const isYes = (v) => ['yes', 'y', 'true', '1'].includes(String(v).toLowerCase());

export function analyse(rows) {
  const parsed = rows.map((r) => ({ ...r, seconds: durationSeconds(r), correct: isYes(r.verified_correct), retries: Number(r.retries || 0) }));
  const workflows = [...new Set(parsed.map((r) => r.workflow))];
  const byWorkflow = {};
  for (const w of workflows) {
    const all = parsed.filter((r) => r.workflow === w);
    const good = all.filter((r) => r.correct && Number.isFinite(r.seconds));
    const values = good.map((r) => r.seconds);
    byWorkflow[w] = {
      rows: all.length,
      notVerifiedCorrect: all.filter((r) => !r.correct).length,
      withRetries: all.filter((r) => r.retries > 0).length,
      n: values.length,
      median: median(values),
      p95: percentile(values, 95),
      p95Reliable: values.length >= 20,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  // Paired differences: the same update_id done in both workflows.
  const pairs = [];
  for (const id of new Set(parsed.map((r) => r.update_id))) {
    const a = parsed.find((r) => r.update_id === id && r.workflow === 'previous' && r.correct && Number.isFinite(r.seconds));
    const b = parsed.find((r) => r.update_id === id && r.workflow === 'proofdesk' && r.correct && Number.isFinite(r.seconds));
    if (a && b) pairs.push({ id, size: a.size, previous: a.seconds, proofdesk: b.seconds, saved: a.seconds - b.seconds });
  }
  const saved = pairs.map((p) => p.saved);
  // Percentage reduction per pair = saved / previous * 100; headline is the median of these.
  const pct = pairs.map((p) => (p.saved / p.previous) * 100);
  const [plo, phi] = pct.length >= 2 ? bootstrapCI(pct, median, { seed: 98 }) : [NaN, NaN];
  const [lo, hi] = saved.length >= 2 ? bootstrapCI(saved, median, { seed: 99 }) : [NaN, NaN];
  return {
    byWorkflow,
    pairs,
    pairedMedianSaved: median(saved),
    pairedMedianSavedCI95: [lo, hi],
    pairedMedianPercentReduction: median(pct),
    pairedMedianPercentReductionCI95: [plo, phi],
    proofdeskFasterInPairs: pairs.filter((p) => p.saved > 0).length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node professor_analyze.mjs professor_log.csv'); process.exit(1); }
  const result = analyse(parseCsv(fs.readFileSync(file, 'utf-8')));
  const f = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
  console.log('| Workflow | Updates | Not verified correct | With retries | n used | Median (s) | p95 (s) | Min | Max |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [w, s] of Object.entries(result.byWorkflow)) {
    console.log(`| ${w} | ${s.rows} | ${s.notVerifiedCorrect} | ${s.withRetries} | ${s.n} | ${f(s.median)} | ${f(s.p95)}${s.p95Reliable ? '' : ' (unreliable: n < 20)'} | ${f(s.min)} | ${f(s.max)} |`);
  }
  console.log(`\nPaired updates: ${result.pairs.length}. Proofdesk faster in ${result.proofdeskFasterInPairs} of them.`);
  console.log(`Median time saved per update (previous - proofdesk): ${f(result.pairedMedianSaved)} s, 95% CI [${f(result.pairedMedianSavedCI95[0])}, ${f(result.pairedMedianSavedCI95[1])}]`);
  console.log(`Median per-update reduction: ${f(result.pairedMedianPercentReduction)} %, 95% CI [${f(result.pairedMedianPercentReductionCI95[0])}, ${f(result.pairedMedianPercentReductionCI95[1])}] (paired n = ${result.pairs.length}; one professor)`);
}
