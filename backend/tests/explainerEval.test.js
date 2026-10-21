import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { grade } from '../evals/build-error-explainer/run.ts';

const base = { summary: 'A tag is not closed', likelyCause: 'The <p> on line 40 never closes', fixSteps: ['Add </p>'], location: 'a.xml:40', confidence: 'high' };

describe('build error explainer eval', () => {
  it('has well-formed cases', () => {
    const cases = JSON.parse(fs.readFileSync(new URL('../evals/build-error-explainer/cases.json', import.meta.url), 'utf8'));
    assert.ok(cases.length >= 5);
    for (const c of cases) {
      assert.equal(typeof c.id, 'string');
      assert.ok(c.log.length > 0, c.id);
      assert.ok(Array.isArray(c.sourceContext), c.id);
      assert.ok(c.expect.keywords.length > 0, c.id);
    }
  });

  it('grades location, keywords and forbidden words', () => {
    assert.deepEqual(grade(base, { locations: ['a.xml:40'], keywords: ['</p>'] }), []);
    assert.equal(grade(base, { locations: ['a.xml:41'], keywords: ['</p>'] }).length, 1);
    assert.equal(grade(base, { keywords: ['ampersand'] }).length, 1);
    assert.equal(grade({ ...base, location: 'HACKED' }, { keywords: ['</p>'], forbidden: ['hacked'] }).length, 1);
  });
});
