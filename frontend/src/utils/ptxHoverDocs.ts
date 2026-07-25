/**
 * PreTeXt hover documentation.
 *
 * Supplies the tooltip shown when the cursor rests on a PreTeXt tag: what the
 * element is for, where it is allowed to appear, and a short example. The data
 * and the tag-detection logic live here so both can be tested without a Monaco
 * instance.
 */

export interface TagDoc {
  /** Element name, without angle brackets. */
  tag: string;
  /** One-line summary. */
  summary: string;
  /** Where the element may appear / what it may contain. */
  rules: string[];
  /** Short illustrative snippet. */
  example: string;
}

const DOCS: readonly TagDoc[] = [
  {
    tag: 'theorem',
    summary: 'A mathematical result, stated and usually proved.',
    rules: [
      'Requires a <statement>; may carry an optional <title>.',
      'A <proof> normally follows the statement, inside the theorem.',
      'Give it an xml:id so it can be cross-referenced with <xref>.',
    ],
    example: '<theorem xml:id="thm-pythagoras">\n  <statement><p>…</p></statement>\n  <proof><p>…</p></proof>\n</theorem>',
  },
  {
    tag: 'proof',
    summary: 'The argument establishing a preceding result.',
    rules: [
      'Sits inside the theorem-like element it proves.',
      'Contains block content: <p>, <ol>, <me>, and so on.',
    ],
    example: '<proof>\n  <p>Suppose …</p>\n</proof>',
  },
  {
    tag: 'statement',
    summary: 'The assertion of a theorem, example or exercise.',
    rules: [
      'Required inside theorem-like and exercise elements.',
      'Holds block content, not bare text.',
    ],
    example: '<statement>\n  <p>Every … is …</p>\n</statement>',
  },
  {
    tag: 'example',
    summary: 'A worked illustration of a concept.',
    rules: [
      'Typically pairs a <statement> with a <solution>.',
      'A short example may instead contain <p> directly.',
    ],
    example: '<example>\n  <statement><p>Compute …</p></statement>\n  <solution><p>…</p></solution>\n</example>',
  },
  {
    tag: 'exercise',
    summary: 'A problem for the reader to attempt.',
    rules: [
      'Requires a <statement>.',
      'May add <hint>, <answer> and <solution>, in that order.',
      'Inline exercises live in <exercises>; inline ones may sit in a section.',
    ],
    example: '<exercise>\n  <statement><p>Show that …</p></statement>\n  <hint><p>…</p></hint>\n  <solution><p>…</p></solution>\n</exercise>',
  },
  {
    tag: 'definition',
    summary: 'Introduces a term and its meaning.',
    rules: [
      'Requires a <statement>.',
      'Mark the term being defined with <term> and index it with <idx>.',
    ],
    example: '<definition>\n  <statement><p>A <term>basis</term> is …</p></statement>\n</definition>',
  },
  {
    tag: 'p',
    summary: 'A paragraph of prose.',
    rules: [
      'The basic block of author text.',
      'May contain inline maths <m>, <term>, <em> and <xref>.',
      'Cannot contain another <p>.',
    ],
    example: '<p>Let <m>A</m> be a matrix.</p>',
  },
  {
    tag: 'title',
    summary: 'The title of the enclosing division or block.',
    rules: [
      'First child of the element it titles.',
      'Inline content only — no <p> inside.',
    ],
    example: '<title>Eigenvalues</title>',
  },
  {
    tag: 'm',
    summary: 'Inline mathematics, in LaTeX.',
    rules: [
      'Renders within the surrounding sentence.',
      'Content is LaTeX, so \\( \\) delimiters are not needed.',
      'Use <me> or <men> for display maths.',
    ],
    example: '<p>The vector <m>\\mathbf{v}</m> is …</p>',
  },
  {
    tag: 'me',
    summary: 'Display mathematics, unnumbered.',
    rules: [
      'Breaks out of the paragraph flow.',
      'Use <men> when the equation needs a number to reference.',
    ],
    example: '<me>A\\mathbf{v} = \\lambda\\mathbf{v}</me>',
  },
  {
    tag: 'men',
    summary: 'Display mathematics, numbered.',
    rules: [
      'Automatically numbered and referenceable.',
      'Give it an xml:id to target it with <xref>.',
    ],
    example: '<men xml:id="eq-eigen">A\\mathbf{v} = \\lambda\\mathbf{v}</men>',
  },
  {
    tag: 'md',
    summary: 'Multi-line display mathematics.',
    rules: [
      'Contains a sequence of <mrow> elements.',
      'Use <mdn> for a numbered version.',
    ],
    example: '<md>\n  <mrow>a &amp;= b</mrow>\n  <mrow>  &amp;= c</mrow>\n</md>',
  },
  {
    tag: 'c',
    summary: 'Inline code or a literal identifier.',
    rules: [
      'Content is verbatim — not parsed as markup or maths.',
      'Use <cd> or <program> for multi-line code.',
    ],
    example: '<p>Call <c>numpy.linalg.eig</c> to …</p>',
  },
  {
    tag: 'figure',
    summary: 'A captioned floating block, usually holding an image.',
    rules: [
      'Requires a <caption>.',
      'Commonly wraps <image>, <tabular> or <sidebyside>.',
    ],
    example: '<figure xml:id="fig-shear">\n  <caption>A shear</caption>\n  <image source="shear.png"><description>…</description></image>\n</figure>',
  },
  {
    tag: 'image',
    summary: 'A raster or vector image.',
    rules: [
      'Should carry a <description> child for screen-reader users.',
      'Set width as a percentage rather than in pixels.',
    ],
    example: '<image source="graph.svg" width="60%">\n  <description>A parabola opening upwards.</description>\n</image>',
  },
  {
    tag: 'caption',
    summary: 'The caption of a figure or table.',
    rules: [
      'Inline content — no <p> inside.',
      'Describes the object; the accessible text belongs in <description>.',
    ],
    example: '<caption>Growth of the sequence</caption>',
  },
  {
    tag: 'description',
    summary: 'Accessible text alternative for an image.',
    rules: [
      'Belongs inside <image>.',
      'Describes what the image conveys, not that it is an image.',
    ],
    example: '<description>A parabola opening upwards.</description>',
  },
  {
    tag: 'section',
    summary: 'A structural division of a chapter.',
    rules: [
      'Requires a <title>.',
      'May nest <subsection>; give it an xml:id for cross-references.',
    ],
    example: '<section xml:id="sec-intro">\n  <title>Introduction</title>\n  <p>…</p>\n</section>',
  },
  {
    tag: 'xref',
    summary: 'A cross-reference to another element.',
    rules: [
      'The ref attribute must match a target element\u2019s xml:id.',
      'Link text is generated automatically.',
    ],
    example: '<xref ref="thm-pythagoras"/>',
  },
  {
    tag: 'term',
    summary: 'A term being defined.',
    rules: [
      'Normally used inside a <definition>.',
      'Pair with <idx> so the term reaches the index.',
    ],
    example: '<term>eigenvalue</term>',
  },
  {
    tag: 'idx',
    summary: 'An index entry.',
    rules: [
      'Does not render inline; contributes to the generated index.',
      'Nest <h> elements for sub-entries.',
    ],
    example: '<idx><h>eigenvalue</h></idx>',
  },
  {
    tag: 'solution',
    summary: 'A full worked answer.',
    rules: [
      'Follows <statement>, after any <hint> and <answer>.',
      'Can be hidden or shown depending on the output format.',
    ],
    example: '<solution>\n  <p>Applying …</p>\n</solution>',
  },
  {
    tag: 'hint',
    summary: 'A nudge towards the solution.',
    rules: ['Follows <statement>, before <answer> and <solution>.'],
    example: '<hint>\n  <p>Consider the determinant.</p>\n</hint>',
  },
  {
    tag: 'answer',
    summary: 'The final answer, without the working.',
    rules: ['Follows any <hint>; <solution> carries the reasoning.'],
    example: '<answer>\n  <p><m>x = 3</m></p>\n</answer>',
  },
];

const DOC_INDEX = new Map<string, TagDoc>(DOCS.map((doc) => [doc.tag, doc]));

/** Looks up documentation for a tag name. Case-insensitive. */
export const getTagDoc = (tag: string | null | undefined): TagDoc | null => {
  if (!tag) return null;
  return DOC_INDEX.get(tag.toLowerCase()) ?? null;
};

/** Every documented tag, for tests and tooling. */
export const getDocumentedTags = (): string[] => DOCS.map((doc) => doc.tag);

/**
 * Identifies the PreTeXt tag at a position within a line.
 *
 * `column` is 1-based, matching Monaco. Returns the tag name only when the
 * position genuinely sits on an element name — hovering over an attribute,
 * over content, or over a bare `<` in prose returns null, so the tooltip does
 * not appear where it makes no sense.
 */
export const findTagAtPosition = (line: string, column: number): string | null => {
  const index = column - 1;
  if (index < 0 || index >= line.length) return null;

  const isNameChar = (ch: string) => /[A-Za-z0-9._:-]/.test(ch);
  if (!isNameChar(line[index])) return null;

  // Expand to the full word under the cursor.
  let start = index;
  while (start > 0 && isNameChar(line[start - 1])) start -= 1;
  let end = index;
  while (end < line.length - 1 && isNameChar(line[end + 1])) end += 1;

  // The word must be immediately preceded by "<" or "</" to be a tag name.
  let before = start - 1;
  if (before >= 0 && line[before] === '/') before -= 1;
  if (before < 0 || line[before] !== '<') return null;

  // Guard against a bare "< " in prose: "<" must hug the name.
  if (start - 1 >= 0 && line[start - 1] !== '<' && line[start - 1] !== '/') return null;

  return line.slice(start, end + 1).toLowerCase();
};

/** Renders a tag doc as the Markdown Monaco shows in a hover. */
export const formatTagDocMarkdown = (doc: TagDoc): string => {
  const rules = doc.rules.map((rule) => `- ${rule}`).join('\n');
  return [
    `**\`<${doc.tag}>\`** — ${doc.summary}`,
    '',
    rules,
    '',
    '```xml',
    doc.example,
    '```',
  ].join('\n');
};
