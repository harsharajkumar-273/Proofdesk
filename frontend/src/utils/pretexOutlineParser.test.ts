import { describe, it, expect } from 'vitest';
import { parsePretextOutline, formatTagDisplayName } from './pretexOutlineParser';

describe('pretexOutlineParser', () => {
  it('formats tag display names with fallback and xml:id', () => {
    expect(formatTagDisplayName('chapter')).toBe('Chapter');
    expect(formatTagDisplayName('section', 'sec-intro')).toBe('Section (#sec-intro)');
    expect(formatTagDisplayName('reading-questions')).toBe('Reading Questions');
  });

  it('returns empty array for empty or invalid content', () => {
    expect(parsePretextOutline('')).toEqual([]);
    expect(parsePretextOutline(null as any)).toEqual([]);
  });

  it('parses hierarchical PreTeXt document structure with line numbers and titles', () => {
    const xml = `
<book xml:id="sample-book">
  <title>Linear Algebra Textbook</title>
  <chapter xml:id="ch-vectors">
    <title>Vector Spaces</title>
    <introduction>
      <p>Introductory remarks...</p>
    </introduction>
    <section xml:id="sec-subspaces">
      <title>Subspaces and Bases</title>
      <subsection xml:id="subsec-basis">
        <title>Basis of a Subspace</title>
      </subsection>
    </section>
    <exercises xml:id="ex-vectors">
      <title>Chapter Exercises</title>
    </exercises>
  </chapter>
</book>
    `.trim();

    const outline = parsePretextOutline(xml);
    expect(outline).toHaveLength(1);

    const bookNode = outline[0];
    expect(bookNode.tag).toBe('book');
    expect(bookNode.title).toBe('Linear Algebra Textbook');
    expect(bookNode.xmlId).toBe('sample-book');
    expect(bookNode.line).toBe(1);

    // Book children: chapter
    expect(bookNode.children).toHaveLength(1);
    const chapterNode = bookNode.children[0];
    expect(chapterNode.tag).toBe('chapter');
    expect(chapterNode.title).toBe('Vector Spaces');
    expect(chapterNode.line).toBe(3);

    // Chapter children: introduction, section, exercises
    expect(chapterNode.children).toHaveLength(3);
    expect(chapterNode.children[0].tag).toBe('introduction');
    expect(chapterNode.children[0].line).toBe(5);

    const sectionNode = chapterNode.children[1];
    expect(sectionNode.tag).toBe('section');
    expect(sectionNode.title).toBe('Subspaces and Bases');
    expect(sectionNode.line).toBe(8);

    // Section children: subsection
    expect(sectionNode.children).toHaveLength(1);
    const subSectionNode = sectionNode.children[0];
    expect(subSectionNode.tag).toBe('subsection');
    expect(subSectionNode.title).toBe('Basis of a Subspace');
    expect(subSectionNode.line).toBe(10);

    const exercisesNode = chapterNode.children[2];
    expect(exercisesNode.tag).toBe('exercises');
    expect(exercisesNode.title).toBe('Chapter Exercises');
    expect(exercisesNode.line).toBe(14);
  });

  it('uses fallback display titles when <title> tag is absent', () => {
    const xml = `
<chapter xml:id="ch-no-title">
  <section xml:id="sec-1">
  </section>
  <exercises />
</chapter>
    `.trim();

    const outline = parsePretextOutline(xml);
    expect(outline).toHaveLength(1);
    const chapter = outline[0];

    expect(chapter.tag).toBe('chapter');
    expect(chapter.title).toBe('Chapter (#ch-no-title)');

    expect(chapter.children[0].title).toBe('Section (#sec-1)');
    expect(chapter.children[1].title).toBe('Exercises');
  });

  it('handles nested blocks like theorems and figures', () => {
    const xml = `
<section xml:id="sec-thm">
  <title>Key Theorems</title>
  <theorem xml:id="thm-pythagoras">
    <title>Pythagorean Theorem</title>
  </theorem>
  <figure xml:id="fig-triangle" />
</section>
    `.trim();

    const outline = parsePretextOutline(xml);
    expect(outline).toHaveLength(1);
    const sec = outline[0];
    expect(sec.children).toHaveLength(2);

    expect(sec.children[0].tag).toBe('theorem');
    expect(sec.children[0].title).toBe('Pythagorean Theorem');
    expect(sec.children[1].tag).toBe('figure');
  });
});
