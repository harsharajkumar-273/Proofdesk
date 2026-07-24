import { describe, it, expect } from 'vitest';
import { validatePtxBuffer, isPtxFile } from './pretexValidator';

describe('isPtxFile', () => {
  it('accepts .xml and .ptx files', () => {
    expect(isPtxFile('chapter.xml')).toBe(true);
    expect(isPtxFile('section.ptx')).toBe(true);
  });

  it('rejects non-PreTeXt files', () => {
    expect(isPtxFile('main.tex')).toBe(false);
    expect(isPtxFile('app.ts')).toBe(false);
    expect(isPtxFile(null)).toBe(false);
    expect(isPtxFile(undefined)).toBe(false);
  });
});

describe('validatePtxBuffer', () => {
  it('returns no issues for a non-ptx file', () => {
    const issues = validatePtxBuffer('<p><p>bad</p></p>', 'file.ts');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues for well-formed structure', () => {
    const xml = '<theorem><statement><p>Let <m>x</m> be a vector.</p></statement><proof><p>Proof.</p></proof></theorem>';
    const issues = validatePtxBuffer(xml, 'chapter.xml');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues for self-closing void elements', () => {
    const xml = '<p>Hello<br/> world and <var/>.</p>';
    const issues = validatePtxBuffer(xml, 'chapter.xml');
    expect(issues).toHaveLength(0);
  });

  it('flags math nested inside math', () => {
    const issues = validatePtxBuffer('<m><m>x</m></m>', 'chapter.xml');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/<m> cannot be nested/);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].source).toBe('proofdesk-ptx');
  });

  it('flags <me> nested inside <m>', () => {
    const issues = validatePtxBuffer('<m><me>x</me></m>', 'chapter.xml');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/<me> cannot be nested/);
  });

  it('flags <p> nested inside <p>', () => {
    const issues = validatePtxBuffer('<p><p>nested</p></p>', 'chapter.xml');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/<p> cannot be nested/);
    expect(issues[0].severity).toBe('error');
  });

  it('flags block element inside <p>', () => {
    const issues = validatePtxBuffer('<p><theorem>bad</theorem></p>', 'chapter.xml');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/<theorem> cannot appear inside a <p>/);
    expect(issues[0].severity).toBe('error');
  });

  it('flags <ol> inside <p>', () => {
    const issues = validatePtxBuffer('<p><ol><li>item</li></ol></p>', 'chapter.xml');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/<ol> cannot appear inside a <p>/);
  });

  it('flags <title> nested inside <title>', () => {
    const issues = validatePtxBuffer('<title>Main <title>Sub</title></title>', 'chapter.xml');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/<title> cannot be nested/);
  });

  it('flags <proof> nested inside <proof>', () => {
    const issues = validatePtxBuffer('<proof><proof>inner</proof></proof>', 'chapter.xml');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/<proof> cannot be nested/);
  });

  it('flags a close tag with no matching open tag', () => {
    const issues = validatePtxBuffer('</theorem>', 'chapter.xml');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/<\/theorem> has no matching opening tag/);
    expect(issues[0].severity).toBe('error');
  });

  it('flags wrong nesting order', () => {
    const issues = validatePtxBuffer('<theorem><proof></theorem></proof>', 'chapter.xml');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toMatch(/<proof> is not closed before <\/theorem>/);
    expect(issues[0].severity).toBe('error');
  });

  it('warns about unclosed content-level elements at EOF', () => {
    const issues = validatePtxBuffer('<p>text without close', 'chapter.xml');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/<p> is never closed/);
    expect(issues[0].severity).toBe('warning');
  });

  it('does not warn about unclosed container elements (fragment files)', () => {
    // A fragment file may have <section> as root without closing it
    const issues = validatePtxBuffer('<section><title>T</title><p>text</p>', 'chapter.xml');
    const unclosedSection = issues.filter((i) => i.message.includes('<section> is never closed'));
    expect(unclosedSection).toHaveLength(0);
  });

  it('correctly reports line and column for an issue', () => {
    const xml = '<theorem>\n  <proof>\n</theorem>';
    const issues = validatePtxBuffer(xml, 'chapter.xml');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].startLineNumber).toBe(2);
  });

  it('returns no issues for valid nested section with math', () => {
    const xml = [
      '<section xml:id="intro">',
      '  <title>Introduction</title>',
      '  <p>Let <m>Ax = b</m> be a linear system.</p>',
      '</section>',
    ].join('\n');
    const issues = validatePtxBuffer(xml, 'intro.xml');
    expect(issues).toHaveLength(0);
  });
});

describe('validatePtxBuffer — image accessibility (missing description)', () => {
  const warnings = (xml: string) =>
    validatePtxBuffer(xml, 'chapter.xml').filter((i) => /missing a <description>/.test(i.message));

  it('flags a self-closing <image/> with no description', () => {
    const issues = warnings('<figure><image source="graph.png" width="60%"/></figure>');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('flags a paired <image> with no description child', () => {
    const issues = warnings('<figure><image source="graph.png"></image></figure>');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('accepts an <image> with a <description> child', () => {
    const xml = '<figure><image source="graph.png"><description>A parabola opening upward.</description></image></figure>';
    expect(warnings(xml)).toHaveLength(0);
  });

  it('accepts an <image> with a <shortdescription> child', () => {
    const xml = '<image source="g.png"><shortdescription>A parabola.</shortdescription></image>';
    expect(warnings(xml)).toHaveLength(0);
  });

  it('accepts a self-closing <description/> child', () => {
    expect(warnings('<image source="g.png"><description/></image>')).toHaveLength(0);
  });

  it('does not credit a <description> that is not a direct child of the image', () => {
    // The description here belongs to the figure, not the image.
    const xml = '<figure><description>Figure caption.</description><image source="g.png"/></figure>';
    expect(warnings(xml)).toHaveLength(1);
  });

  it('reports each offending image separately', () => {
    const xml = '<figure><image source="a.png"/><image source="b.png"/></figure>';
    expect(warnings(xml)).toHaveLength(2);
  });

  it('reports only the image that lacks a description', () => {
    const xml =
      '<figure><image source="a.png"><description>Described.</description></image><image source="b.png"/></figure>';
    expect(warnings(xml)).toHaveLength(1);
  });

  it('is a warning, never an error, so it does not block compilation', () => {
    const issues = validatePtxBuffer('<image source="g.png"/>', 'chapter.xml');
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('ignores images in non-PreTeXt files', () => {
    expect(validatePtxBuffer('<image source="g.png"/>', 'notes.md')).toHaveLength(0);
  });

  it('points the squiggle at the image tag itself', () => {
    const xml = '<figure>\n  <image source="graph.png"/>\n</figure>';
    const issue = warnings(xml)[0];
    expect(issue.startLineNumber).toBe(2);
    expect(issue.endColumn).toBeGreaterThan(issue.startColumn);
  });
});
