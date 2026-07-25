/**
 * PreTeXt snippet library.
 *
 * Scaffolding for the block structures authors write constantly. Each snippet
 * is plain text rather than a Monaco snippet-syntax string, because it is
 * inserted through the same `executeEdits` path the importer already uses, and
 * that path does not interpret tab stops.
 *
 * Indentation is applied at insertion time to match the line the cursor is on,
 * so a snippet dropped inside a `<section>` lines up with its siblings instead
 * of resetting to column one.
 */

export interface PtxSnippet {
  id: string;
  /** Human label, also what the command palette matches against. */
  title: string;
  /** Short description shown beneath the title. */
  description: string;
  /** Extra search terms. */
  keywords: string[];
  /** The snippet body, unindented, using \n line endings. */
  body: string;
}

export const PTX_SNIPPETS: readonly PtxSnippet[] = [
  {
    id: 'theorem',
    title: 'Theorem',
    description: 'Theorem with statement and proof',
    keywords: ['thm', 'result', 'proposition'],
    body: [
      '<theorem xml:id="thm-">',
      '  <title></title>',
      '  <statement>',
      '    <p></p>',
      '  </statement>',
      '  <proof>',
      '    <p></p>',
      '  </proof>',
      '</theorem>',
    ].join('\n'),
  },
  {
    id: 'proof',
    title: 'Proof',
    description: 'Standalone proof block',
    keywords: ['qed', 'argument'],
    body: ['<proof>', '  <p></p>', '</proof>'].join('\n'),
  },
  {
    id: 'example',
    title: 'Example',
    description: 'Worked example with statement and solution',
    keywords: ['eg', 'worked', 'illustration'],
    body: [
      '<example xml:id="eg-">',
      '  <title></title>',
      '  <statement>',
      '    <p></p>',
      '  </statement>',
      '  <solution>',
      '    <p></p>',
      '  </solution>',
      '</example>',
    ].join('\n'),
  },
  {
    id: 'exercise',
    title: 'Exercise',
    description: 'Exercise with hint, answer and solution',
    keywords: ['problem', 'question', 'practice'],
    body: [
      '<exercise xml:id="ex-">',
      '  <statement>',
      '    <p></p>',
      '  </statement>',
      '  <hint>',
      '    <p></p>',
      '  </hint>',
      '  <answer>',
      '    <p></p>',
      '  </answer>',
      '  <solution>',
      '    <p></p>',
      '  </solution>',
      '</exercise>',
    ].join('\n'),
  },
  {
    id: 'definition',
    title: 'Definition',
    description: 'Definition with an indexed term',
    keywords: ['define', 'term', 'notation'],
    body: [
      '<definition xml:id="def-">',
      '  <title></title>',
      '  <statement>',
      '    <p>A <term></term> is <idx></idx>.</p>',
      '  </statement>',
      '</definition>',
    ].join('\n'),
  },
  {
    id: 'figure',
    title: 'Figure with image',
    description: 'Figure, caption and accessible description',
    keywords: ['image', 'picture', 'diagram', 'caption'],
    body: [
      '<figure xml:id="fig-">',
      '  <caption></caption>',
      '  <image source="" width="60%">',
      '    <description></description>',
      '  </image>',
      '</figure>',
    ].join('\n'),
  },
  {
    id: 'displaymath',
    title: 'Display equation',
    description: 'Numbered display equation',
    keywords: ['me', 'men', 'equation', 'math', 'latex'],
    body: ['<men xml:id="eq-">', '  ', '</men>'].join('\n'),
  },
  {
    id: 'section',
    title: 'Section',
    description: 'Section with an introduction paragraph',
    keywords: ['chapter', 'heading', 'structure'],
    body: [
      '<section xml:id="sec-">',
      '  <title></title>',
      '  <p></p>',
      '</section>',
    ].join('\n'),
  },
];

/**
 * Re-indents a snippet body to sit under a given indentation prefix.
 *
 * The first line is returned unindented, because the cursor is already at the
 * insertion column; every subsequent line receives the prefix so the block
 * aligns with its surroundings.
 */
export const indentSnippet = (body: string, indent: string): string => {
  if (indent === '') return body;
  const lines = body.split('\n');
  return lines
    .map((line, index) => {
      if (index === 0) return line;
      // Preserve genuinely blank lines rather than filling them with spaces.
      return line === '' ? line : `${indent}${line}`;
    })
    .join('\n');
};

/**
 * Extracts the leading whitespace of a line, used as the indent prefix for an
 * inserted snippet.
 */
export const leadingWhitespace = (line: string): string => {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0] : '';
};

/** Looks a snippet up by id. */
export const getSnippet = (id: string): PtxSnippet | undefined =>
  PTX_SNIPPETS.find((snippet) => snippet.id === id);
