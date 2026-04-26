import { describe, expect, it } from 'vitest';
import {
  isMathValidatableFile,
  validateMathInBuffer,
  extractMathSnippets,
} from './mathValidator';

describe('mathValidator', () => {
  describe('isMathValidatableFile', () => {
    it('accepts .xml, .ptx, .tex, .ltx', () => {
      expect(isMathValidatableFile('chapter.xml')).toBe(true);
      expect(isMathValidatableFile('chapter.ptx')).toBe(true);
      expect(isMathValidatableFile('proof.tex')).toBe(true);
      expect(isMathValidatableFile('proof.ltx')).toBe(true);
    });

    it('rejects unrelated files', () => {
      expect(isMathValidatableFile('App.tsx')).toBe(false);
      expect(isMathValidatableFile('README.md')).toBe(false);
      expect(isMathValidatableFile(undefined)).toBe(false);
      expect(isMathValidatableFile(null)).toBe(false);
    });
  });

  describe('extractMathSnippets', () => {
    it('finds <m> inline math in PreTeXt XML', () => {
      const snippets = extractMathSnippets('<p>See <m>Ax = b</m> for details.</p>', 'a.xml');
      expect(snippets).toHaveLength(1);
      expect(snippets[0].text).toBe('Ax = b');
      expect(snippets[0].displayMode).toBe(false);
    });

    it('finds <me> display math in PreTeXt XML', () => {
      const snippets = extractMathSnippets('<me>x^2 + y^2 = r^2</me>', 'a.xml');
      expect(snippets).toHaveLength(1);
      expect(snippets[0].displayMode).toBe(true);
    });

    it('finds \\( \\) and \\[ \\] LaTeX delimiters in .tex files', () => {
      const snippets = extractMathSnippets(
        'Inline \\(a + b\\) and display \\[c = d\\].',
        'proof.tex',
      );
      expect(snippets).toHaveLength(2);
      expect(snippets[0].text).toBe('a + b');
      expect(snippets[0].displayMode).toBe(false);
      expect(snippets[1].text).toBe('c = d');
      expect(snippets[1].displayMode).toBe(true);
    });

    it('returns nothing for non-math files', () => {
      expect(extractMathSnippets('const x = 1', 'App.tsx')).toEqual([]);
    });
  });

  describe('validateMathInBuffer', () => {
    it('returns no issues for valid math', () => {
      const issues = validateMathInBuffer('<m>A x = b</m>', 'chapter.xml');
      expect(issues).toEqual([]);
    });

    it('flags an unknown control sequence', () => {
      const issues = validateMathInBuffer('<m>\\beeta</m>', 'chapter.xml');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].message.toLowerCase()).toContain('beeta');
      expect(issues[0].severity).toBe('error');
      expect(issues[0].source).toBe('proofdesk-math');
    });

    it('flags unbalanced braces', () => {
      const issues = validateMathInBuffer('<me>\\frac{1}{</me>', 'chapter.xml');
      expect(issues.length).toBeGreaterThan(0);
    });

    it('computes line and column positions inside a multi-line file', () => {
      const content = [
        '<chapter>',
        '  <title>Demo</title>',
        '  <p>See <m>\\unknowncmd</m></p>',
        '</chapter>',
      ].join('\n');
      const issues = validateMathInBuffer(content, 'chapter.xml');
      expect(issues).toHaveLength(1);
      expect(issues[0].startLineNumber).toBe(3);
      expect(issues[0].startColumn).toBeGreaterThan(1);
    });

    it('ignores PreTeXt-specific macros that KaTeX does not understand', () => {
      const content = String.raw`<me>\syseq{ \. \+ x = y }</me>`;
      const issues = validateMathInBuffer(content, 'chapter.xml');
      expect(issues).toEqual([]);
    });

    it('returns no issues for non-validatable files even with broken latex in the text', () => {
      const issues = validateMathInBuffer('\\(\\broken', 'README.md');
      expect(issues).toEqual([]);
    });

    it('validates \\( \\) math inside PreTeXt XML prose too', () => {
      const issues = validateMathInBuffer(
        '<p>Inline \\(\\zzzbad\\) here.</p>',
        'chapter.xml',
      );
      expect(issues.length).toBeGreaterThan(0);
    });
  });
});
