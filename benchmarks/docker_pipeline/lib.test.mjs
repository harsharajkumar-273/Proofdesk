import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  blockRandomOrder,
  bootstrapCI,
  median,
  medianDifferenceCI,
  mulberry32,
  percentile,
  sha256OfTree,
  summarize,
} from './lib.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const range = (n) => Array.from({ length: n }, (_, i) => i + 1); // 1..n

describe('median', () => {
  it('takes the middle value of an odd-sized sample', () => assert.equal(median([5, 1, 3]), 3));
  it('averages the two middle values of an even-sized sample', () => assert.equal(median([4, 1, 3, 2]), 2.5));
  it('does not depend on input order', () => assert.equal(median([9, 1, 5, 7, 3]), median([1, 3, 5, 7, 9])));
  it('is NaN for an empty sample instead of throwing', () => assert.ok(Number.isNaN(median([]))));
});

describe('percentile (nearest rank)', () => {
  it('p95 of 1..50 is the 48th value, so it is decided by the three slowest runs', () => {
    assert.equal(percentile(range(50), 95), 48);
  });
  it('p95 of 1..100 is 95', () => assert.equal(percentile(range(100), 95), 95));
  it('p50 of 1..50 is the 25th value', () => assert.equal(percentile(range(50), 50), 25));
  it('p100 is the maximum and p0 never indexes below the first value', () => {
    assert.equal(percentile(range(10), 100), 10);
    assert.equal(percentile(range(10), 0), 1);
  });
  it('a single sample is its own percentile', () => assert.equal(percentile([7], 95), 7));
  it('does not mutate its input', () => {
    const input = [3, 1, 2];
    percentile(input, 95);
    assert.deepEqual(input, [3, 1, 2]);
  });
});

describe('summarize', () => {
  it('reports n, median, p95, mean, min, max and intervals', () => {
    const s = summarize(range(50));
    assert.equal(s.n, 50);
    assert.equal(s.median, 25.5);
    assert.equal(s.p95, 48);
    assert.equal(s.mean, 25.5);
    assert.equal(s.min, 1);
    assert.equal(s.max, 50);
    assert.ok(s.medianCI95[0] <= s.median && s.median <= s.medianCI95[1]);
  });
  it('handles an empty sample', () => assert.deepEqual(summarize([]), { n: 0 }));
});

describe('bootstrapCI', () => {
  it('is reproducible for the same seed', () => {
    const values = range(30);
    assert.deepEqual(bootstrapCI(values, median, { seed: 1 }), bootstrapCI(values, median, { seed: 1 }));
  });
  it('collapses to a point when every value is identical', () => {
    assert.deepEqual(bootstrapCI(Array(20).fill(5), median), [5, 5]);
  });
  it('is wider for noisier data', () => {
    const quiet = bootstrapCI(range(50).map((x) => 100 + (x % 2)), median);
    const noisy = bootstrapCI(range(50).map((x) => x * 20), median);
    assert.ok(noisy[1] - noisy[0] > quiet[1] - quiet[0]);
  });
});

describe('medianDifferenceCI', () => {
  it('excludes zero for clearly different samples', () => {
    const [lo, hi] = medianDifferenceCI(range(40).map((x) => x + 100), range(40));
    assert.ok(lo > 0 && hi > 0);
  });
  it('includes zero for samples from the same distribution', () => {
    const rand = mulberry32(9);
    const a = Array.from({ length: 60 }, () => rand());
    const b = Array.from({ length: 60 }, () => rand());
    const [lo, hi] = medianDifferenceCI(a, b);
    assert.ok(lo <= 0 && hi >= 0);
  });
});

describe('blockRandomOrder', () => {
  const conditions = ['A', 'B', 'C', 'D'];
  it('contains every condition exactly once per block', () => {
    const order = blockRandomOrder(conditions, 10, 1);
    assert.equal(order.length, 40);
    for (let block = 0; block < 10; block += 1) {
      const names = order.filter((o) => o.block === block).map((o) => o.condition).sort();
      assert.deepEqual(names, conditions);
    }
  });
  it('is reproducible for a seed and differs between seeds', () => {
    assert.deepEqual(blockRandomOrder(conditions, 5, 3), blockRandomOrder(conditions, 5, 3));
    assert.notDeepEqual(blockRandomOrder(conditions, 5, 3), blockRandomOrder(conditions, 5, 4));
  });
});

describe('sha256OfTree', () => {
  const make = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-'));
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
    return dir;
  };
  it('is identical for identical content and changes when a byte changes', () => {
    const a = make({ 'x.txt': 'one', 'y.txt': 'two' });
    const b = make({ 'y.txt': 'two', 'x.txt': 'one' }); // created in another order
    const c = make({ 'x.txt': 'one', 'y.txt': 'twp' });
    assert.equal(sha256OfTree(a), sha256OfTree(b));
    assert.notEqual(sha256OfTree(a), sha256OfTree(c));
  });
  it('changes when a file is renamed', () => {
    assert.notEqual(sha256OfTree(make({ 'a.txt': 'z' })), sha256OfTree(make({ 'b.txt': 'z' })));
  });
});
