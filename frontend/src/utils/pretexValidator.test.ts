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
