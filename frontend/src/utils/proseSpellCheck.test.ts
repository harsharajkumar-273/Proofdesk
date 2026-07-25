import { describe, it, expect } from 'vitest';
import {
  extractProseSpans,
  maskInlineNonProse,
  tokenizeWords,
  spellCheckBuffer,
  isSpellCheckableFile,
  type SpellChecker,
} from './proseSpellCheck';

/** Returns the concatenated text of every prose span, for readable assertions. */
const proseText = (source: string): string =>
  extractProseSpans(source)
    .map((span) => source.slice(span.start, span.end))
    .join('|');

/**
 * A deterministic stand-in for nspell: every word is correct except those
 * listed. Keeps the extraction tests independent of the 550 KB dictionary.
 */
const fakeChecker = (misspelled: string[], suggestions: Record<string, string[]> = {}): SpellChecker => {
  const bad = new Set(misspelled.map((w) => w.toLowerCase()));
  return {
    correct: (word: string) => !bad.has(word.toLowerCase()),
    suggest: (word: string) => suggestions[word.toLowerCase()] ?? [],
  };
};

describe('extractProseSpans', () => {
  it('collects text from prose elements', () => {
    expect(proseText('<p>Hello world</p>')).toBe('Hello world');
  });

  it('collects from every supported prose element', () => {
    const src = '<title>Alpha</title><p>Beta</p><statement>Gamma</statement><caption>Delta</caption>';
    expect(proseText(src)).toBe('Alpha|Beta|Gamma|Delta');
  });

  it('ignores text outside prose elements', () => {
    expect(proseText('<chapter>ignored<p>kept</p>also ignored</chapter>')).toBe('kept');
  });

  it('excludes inline mathematics nested inside prose', () => {
    const src = '<p>Let <m>x + y</m> denote the sum.</p>';
    expect(proseText(src)).toBe('Let | denote the sum.');
  });

  it('excludes display mathematics elements', () => {
    const src = '<p>Observe <me>a^2 + b^2</me> carefully.</p>';
    expect(proseText(src)).toBe('Observe | carefully.');
  });

  it('excludes code elements nested inside prose', () => {
    const src = '<p>Call <c>numpy.linalg</c> to solve it.</p>';
    expect(proseText(src)).toBe('Call | to solve it.');
  });

  it('excludes program listings', () => {
    const src = '<p>Before</p><program>notprose herefore</program><p>After</p>';
    expect(proseText(src)).toBe('Before|After');
  });

  it('excludes attribute values because only inter-tag text is collected', () => {
    const src = '<p xml:id="thiz-is-nawt-prose" label="alsoo">Real text</p>';
    expect(proseText(src)).toBe('Real text');
  });

  it('does not let a > inside an attribute value end the tag early', () => {
    const src = '<p label="a > b">Visible</p>';
    expect(proseText(src)).toBe('Visible');
  });

  it('excludes XML comments', () => {
    const src = '<p>Kept <!-- speling mistaik in comment --> more</p>';
    expect(proseText(src)).toBe('Kept | more');
  });

  it('excludes CDATA sections', () => {
    const src = '<p>Kept <![CDATA[ raww codee ]]> more</p>';
    expect(proseText(src)).toBe('Kept | more');
  });

  it('excludes doctype and processing instructions', () => {
    const src = '<?xml version="1.0"?><!DOCTYPE pretext><p>Body</p>';
    expect(proseText(src)).toBe('Body');
  });

  it('treats a bare less-than in prose as text, not a tag', () => {
    const src = '<p>whenever x < y holds</p>';
    expect(proseText(src)).toBe('whenever x < y holds');
  });

  it('handles nested prose elements without double counting', () => {
    const src = '<statement><p>Inner text</p></statement>';
    expect(proseText(src)).toBe('Inner text');
  });

  it('resumes prose after a nested non-prose element closes', () => {
    const src = '<p>a<m>Q</m>b<c>Z</c>c</p>';
    expect(proseText(src)).toBe('a|b|c');
  });

  it('ignores self-closing tags for stack tracking', () => {
    const src = '<p>Line one<br/>line two</p>';
    expect(proseText(src)).toBe('Line one|line two');
  });

  it('does not throw on unbalanced markup', () => {
    expect(() => extractProseSpans('<p>unclosed paragraph')).not.toThrow();
    expect(() => extractProseSpans('</p>stray close')).not.toThrow();
    expect(() => extractProseSpans('<p><m>half open</p>')).not.toThrow();
  });

  it('returns no spans for a buffer with no prose', () => {
    expect(extractProseSpans('<chapter><program>code()</program></chapter>')).toEqual([]);
  });

  it('reports offsets that index back into the original source', () => {
    const src = '<chapter><p>needle</p></chapter>';
    const [span] = extractProseSpans(src);
    expect(src.slice(span.start, span.end)).toBe('needle');
  });
});

describe('maskInlineNonProse', () => {
  /**
   * Masking is length-preserving, so asserting on exact space counts is
   * brittle arithmetic. Assert the contract instead: the masked region no
   * longer contains its payload, the surrounding prose survives, and the
   * length is unchanged.
   */
  const expectMasked = (input: string, gone: string[], kept: string[]) => {
    const masked = maskInlineNonProse(input);
    expect(masked).toHaveLength(input.length);
    for (const fragment of gone) expect(masked).not.toContain(fragment);
    for (const fragment of kept) expect(masked).toContain(fragment);
  };

  it('masks inline TeX delimited by \\( \\)', () => {
    expectMasked('before \\(x+y\\) after', ['x+y', '\\(', '\\)'], ['before', 'after']);
  });

  it('masks display TeX delimited by \\[ \\]', () => {
    expectMasked('a \\[xyz\\] b', ['xyz', '\\[', '\\]'], []);
  });

  it('masks dollar-delimited maths', () => {
    expectMasked('take $n+1$ steps', ['n+1', '$'], ['take', 'steps']);
  });

  it('masks double-dollar display maths', () => {
    expectMasked('see $$abc$$ here', ['abc', '$'], ['see', 'here']);
  });

  it('masks TeX macros', () => {
    expectMasked('the \\lambda value', ['lambda', '\\'], ['the', 'value']);
  });

  it('masks XML entities', () => {
    expectMasked('a &amp; b', ['amp', '&', ';'], []);
  });

  it('preserves length so offsets stay valid', () => {
    const input = 'alpha \\(x\\) beta $y$ gamma \\delta';
    expect(maskInlineNonProse(input)).toHaveLength(input.length);
  });

  it('preserves newlines so line numbers stay valid', () => {
    const input = 'one\n$math$\ntwo';
    const masked = maskInlineNonProse(input);
    expect(masked.split('\n')).toHaveLength(3);
  });

  it('does not hang on an unterminated maths delimiter', () => {
    expect(() => maskInlineNonProse('unterminated $math')).not.toThrow();
    expect(() => maskInlineNonProse('unterminated \\(math')).not.toThrow();
  });
});

describe('tokenizeWords', () => {
  it('extracts plain words with offsets', () => {
    expect(tokenizeWords('hello world')).toEqual([
      { word: 'hello', start: 0, end: 5 },
      { word: 'world', start: 6, end: 11 },
    ]);
  });

  it('keeps internal apostrophes', () => {
    expect(tokenizeWords("doesn't").map((t) => t.word)).toEqual(["doesn't"]);
  });

  it('keeps internal hyphens', () => {
    expect(tokenizeWords('well-known').map((t) => t.word)).toEqual(['well-known']);
  });

  it('skips single characters, which are almost always variables', () => {
    expect(tokenizeWords('x and y')).toHaveLength(1);
  });

  it('skips all-caps acronyms', () => {
    expect(tokenizeWords('the RREF form').map((t) => t.word)).toEqual(['the', 'form']);
  });

  it('skips tokens that are part of an identifier or URL', () => {
    expect(tokenizeWords('see https://example.com/page now').map((t) => t.word)).toEqual([
      'see',
      'now',
    ]);
  });

  it('skips words containing digits by not merging across them', () => {
    expect(tokenizeWords('abc123def').map((t) => t.word)).toEqual(['abc', 'def']);
  });
});

describe('spellCheckBuffer', () => {
  it('reports a misspelling inside a paragraph', () => {
    const issues = spellCheckBuffer('<p>This is a mistaik here</p>', fakeChecker(['mistaik']));
    expect(issues).toHaveLength(1);
    expect(issues[0].word).toBe('mistaik');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].source).toBe('proofdesk-spell');
  });

  it('reports Monaco-compatible 1-based positions', () => {
    const src = '<p>ok</p>\n<p>badd word</p>';
    const [issue] = spellCheckBuffer(src, fakeChecker(['badd']));
    expect(issue.startLineNumber).toBe(2);
    expect(issue.startColumn).toBe(4);
    expect(issue.endLineNumber).toBe(2);
    expect(issue.endColumn).toBe(8);
  });

  it('produces a range that selects exactly the misspelled word', () => {
    const src = '<p>alpha badd beta</p>';
    const [issue] = spellCheckBuffer(src, fakeChecker(['badd']));
    const lines = src.split('\n');
    const line = lines[issue.startLineNumber - 1];
    expect(line.slice(issue.startColumn - 1, issue.endColumn - 1)).toBe('badd');
  });

  it('does not flag words inside mathematics', () => {
    const src = '<p>Consider <m>badd</m> here</p>';
    expect(spellCheckBuffer(src, fakeChecker(['badd']))).toHaveLength(0);
  });

  it('does not flag words inside code elements', () => {
    const src = '<p>Run <c>badd</c> now</p>';
    expect(spellCheckBuffer(src, fakeChecker(['badd']))).toHaveLength(0);
  });

  it('does not flag words inside attributes', () => {
    const src = '<p xml:id="badd">fine text</p>';
    expect(spellCheckBuffer(src, fakeChecker(['badd']))).toHaveLength(0);
  });

  it('does not flag words inside inline TeX', () => {
    const src = '<p>Given \\(badd\\) we proceed</p>';
    expect(spellCheckBuffer(src, fakeChecker(['badd']))).toHaveLength(0);
  });

  it('does not flag TeX macro names', () => {
    const src = '<p>The \\lambda parameter</p>';
    expect(spellCheckBuffer(src, fakeChecker(['lambda']))).toHaveLength(0);
  });

  it('does not flag text outside prose elements', () => {
    const src = '<chapter>badd</chapter>';
    expect(spellCheckBuffer(src, fakeChecker(['badd']))).toHaveLength(0);
  });

  it('accepts built-in mathematical vocabulary the dictionary lacks', () => {
    const src = '<p>The eigenvector and the homomorphism</p>';
    const checker = fakeChecker(['eigenvector', 'homomorphism']);
    expect(spellCheckBuffer(src, checker)).toHaveLength(0);
  });

  it('accepts possessive forms of allowlisted terms', () => {
    const src = "<p>Euler's identity</p>";
    expect(spellCheckBuffer(src, fakeChecker(["euler's", 'euler']))).toHaveLength(0);
  });

  it('accepts caller-supplied custom words', () => {
    const src = '<p>The proofdeskify step</p>';
    const checker = fakeChecker(['proofdeskify']);
    expect(spellCheckBuffer(src, checker, { customWords: ['proofdeskify'] })).toHaveLength(0);
  });

  it('accepts a sentence-initial capital when the lowercase form is known', () => {
    const src = '<p>Vector spaces are useful</p>';
    // "Vector" capitalised is unknown, "vector" is known.
    const checker: SpellChecker = {
      correct: (w) => w !== 'Vector',
      suggest: () => [],
    };
    expect(spellCheckBuffer(src, checker)).toHaveLength(0);
  });

  it('includes suggestions in the message when available', () => {
    const src = '<p>recieve the value</p>';
    const checker = fakeChecker(['recieve'], { recieve: ['receive'] });
    const [issue] = spellCheckBuffer(src, checker);
    expect(issue.suggestions).toEqual(['receive']);
    expect(issue.message).toContain('receive');
  });

  it('omits the suggestion clause when there are none', () => {
    const [issue] = spellCheckBuffer('<p>zzzq word</p>', fakeChecker(['zzzq']));
    expect(issue.message).not.toContain('Did you mean');
  });

  it('accepts a hyphenated compound whose parts are all valid', () => {
    // The compound is absent from the dictionary; each part is present.
    const checker = fakeChecker(['quasi-triangular', 'well-defined']);
    expect(spellCheckBuffer('<p>quasi-triangular form</p>', checker)).toHaveLength(0);
    expect(spellCheckBuffer('<p>a well-defined map</p>', checker)).toHaveLength(0);
  });

  it('still flags a hyphenated compound when a part is misspelled', () => {
    const checker = fakeChecker(['quasi-triangluar', 'triangluar']);
    const issues = spellCheckBuffer('<p>quasi-triangluar form</p>', checker);
    expect(issues).toHaveLength(1);
    expect(issues[0].word).toBe('quasi-triangluar');
  });

  it('accepts single-letter parts in compounds such as n-dimensional', () => {
    const checker = fakeChecker(['n-dimensional']);
    expect(spellCheckBuffer('<p>an n-dimensional space</p>', checker)).toHaveLength(0);
  });

  it('honours maxIssues', () => {
    const src = '<p>badd badd badd badd</p>';
    expect(spellCheckBuffer(src, fakeChecker(['badd']), { maxIssues: 2 })).toHaveLength(2);
  });

  it('returns nothing for an empty buffer', () => {
    expect(spellCheckBuffer('', fakeChecker(['x']))).toEqual([]);
  });

  it('survives a checker whose suggest throws', () => {
    const checker: SpellChecker = {
      correct: () => false,
      suggest: () => {
        throw new Error('suggest exploded');
      },
    };
    const issues = spellCheckBuffer('<p>zzzq here</p>', checker);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].suggestions).toEqual([]);
  });

  it('reports every misspelling in a multi-line document at the right line', () => {
    const src = ['<p>first badd line</p>', '<p>second worse line</p>'].join('\n');
    const issues = spellCheckBuffer(src, fakeChecker(['badd', 'worse']));
    expect(issues.map((i) => i.startLineNumber)).toEqual([1, 2]);
  });
});

describe('isSpellCheckableFile', () => {
  it('accepts PreTeXt source extensions', () => {
    expect(isSpellCheckableFile('main.ptx')).toBe(true);
    expect(isSpellCheckableFile('chapter.xml')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isSpellCheckableFile('Chapter.XML')).toBe(true);
  });

  it('rejects other files and missing names', () => {
    expect(isSpellCheckableFile('script.ts')).toBe(false);
    expect(isSpellCheckableFile('README')).toBe(false);
    expect(isSpellCheckableFile(null)).toBe(false);
    expect(isSpellCheckableFile(undefined)).toBe(false);
  });
});
