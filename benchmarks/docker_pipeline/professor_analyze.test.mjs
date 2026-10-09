import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyse, durationSeconds, parseCsv } from './professor_analyze.mjs';

const row = (o) => ({ update_id: '1', size: 'small', workflow: 'previous', t0_iso: '', t1_iso: '', duration_s: '', interruption_s: '0', retries: '0', verified_correct: 'yes', ...o });

describe('parseCsv', () => {
  it('reads quoted fields containing commas and escaped quotes', () => {
    const rows = parseCsv('a,b\n1,"x, ""y"""\n');
    assert.deepEqual(rows, [{ a: '1', b: 'x, "y"' }]);
  });
  it('handles CRLF line endings and a missing trailing newline', () => {
    assert.deepEqual(parseCsv('a,b\r\n1,2\r\n3,4'), [{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });
  it('ignores blank lines', () => assert.equal(parseCsv('a\n1\n\n2\n').length, 2));
});

describe('durationSeconds', () => {
  it('uses T1 - T0 when both timestamps are present', () => {
    assert.equal(durationSeconds(row({ t0_iso: '2026-01-01T10:00:00Z', t1_iso: '2026-01-01T10:01:30Z' })), 90);
  });
  it('falls back to duration_s', () => assert.equal(durationSeconds(row({ duration_s: '42' })), 42));
  it('subtracts interruptions', () => {
    assert.equal(durationSeconds(row({ duration_s: '100', interruption_s: '30' })), 70);
  });
  it('is NaN when nothing usable is recorded', () => assert.ok(Number.isNaN(durationSeconds(row({})))));
});

describe('analyse', () => {
  const rows = [
    row({ update_id: '1', workflow: 'previous', duration_s: '300' }),
    row({ update_id: '1', workflow: 'proofdesk', duration_s: '100' }),
    row({ update_id: '2', workflow: 'previous', duration_s: '500' }),
    row({ update_id: '2', workflow: 'proofdesk', duration_s: '200' }),
    row({ update_id: '3', workflow: 'previous', duration_s: '400' }),
    row({ update_id: '3', workflow: 'proofdesk', duration_s: '90', verified_correct: 'no' }), // wrong publication
  ];
  const result = analyse(rows);

  it('excludes publications that were not verified correct from timing', () => {
    assert.equal(result.byWorkflow.proofdesk.n, 2);
    assert.equal(result.byWorkflow.proofdesk.notVerifiedCorrect, 1);
    assert.equal(result.byWorkflow.previous.n, 3);
  });
  it('pairs only updates that are valid in both workflows', () => {
    assert.deepEqual(result.pairs.map((p) => p.id), ['1', '2']);
    assert.equal(result.pairedMedianSaved, 250); // (200 + 300) / 2
  });
  it('does not call a percentile reliable below 20 samples', () => {
    assert.equal(result.byWorkflow.previous.p95Reliable, false);
  });
  it('counts how many pairs Proofdesk won', () => assert.equal(result.proofdeskFasterInPairs, 2));
});
