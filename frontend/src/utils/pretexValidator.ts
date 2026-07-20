export type PtxValidationSeverity = 'error' | 'warning';

export interface PtxValidationIssue {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: PtxValidationSeverity;
  source: 'proofdesk-ptx';
}

const PTX_FILE_EXTENSIONS = new Set(['xml', 'ptx']);

const getFileExtension = (filename: string): string => {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
};

export const isPtxFile = (filename: string | undefined | null): boolean => {
  if (!filename) return false;
  return PTX_FILE_EXTENSIONS.has(getFileExtension(filename));
};

// Whitelist of known PreTeXt element names — prevents LaTeX `<` from being parsed as tags
const PTX_ELEMENTS = new Set([
  'pretext', 'book', 'article', 'chapter', 'section', 'subsection',
  'subsubsection', 'paragraphs', 'introduction', 'conclusion',
  'theorem', 'lemma', 'corollary', 'proposition', 'claim', 'fact',
  'identity', 'conjecture', 'definition', 'example', 'remark', 'note',
  'warning', 'caution', 'tip', 'convention', 'principle', 'observation',
  'heuristic', 'assumption',
  'exercise', 'exercises', 'project', 'activity', 'exploration',
  'investigation', 'task',
  'statement', 'proof', 'hint', 'answer', 'solution',
  'p', 'title', 'subtitle', 'idx', 'term', 'em', 'alert', 'q', 'sq',
  'dq', 'fn', 'notation', 'pubtitle', 'articletitle',
  'm', 'me', 'men', 'mrow', 'mdn', 'md',
  'ol', 'ul', 'dl', 'li',
  'figure', 'image', 'video', 'interactive', 'table', 'tabular',
  'row', 'cell', 'col',
  'program', 'console', 'input', 'output', 'listing', 'cd',
  'xref', 'ref', 'cite',
  'sidebyside', 'stack', 'sbsgroup',
  'frontmatter', 'backmatter', 'titlepage', 'abstract', 'preface',
  'appendix', 'colophon', 'index',
  'author', 'editor', 'date', 'credit', 'biography', 'website', 'email',
  'br', 'var', 'fillin',
]);

// Document-level containers that may legitimately be the root of an included fragment
const CONTAINER_ELEMENTS = new Set([
  'pretext', 'book', 'article', 'chapter', 'section', 'subsection',
  'subsubsection', 'paragraphs', 'exercises', 'appendix', 'frontmatter',
  'backmatter',
]);

// Elements with no matching close tag
const VOID_ELEMENTS = new Set(['br', 'var', 'fillin']);

// Math elements — cannot be nested inside one another
const MATH_ELEMENTS = new Set(['m', 'me', 'men', 'mrow', 'mdn', 'md']);

// Block-level elements that cannot appear inside <p>
const BLOCK_ELEMENTS = new Set([
  'theorem', 'lemma', 'corollary', 'proposition', 'claim', 'fact',
  'identity', 'conjecture', 'definition', 'example', 'remark', 'note',
  'warning', 'caution', 'tip', 'figure', 'table', 'listing',
  'ol', 'ul', 'dl', 'exercise', 'project', 'activity', 'exploration',
  'investigation', 'sidebyside', 'sbsgroup', 'assemblage',
]);

interface TagToken {
  name: string;
  type: 'open' | 'close' | 'self-closing';
  offset: number;
  tagLength: number;
}

interface StackEntry {
  name: string;
  offset: number;
  tagLength: number;
}

// Matches XML comments/PIs/CDATA first (skip them), then element tags
const TAG_RE =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![\s\S]*?>|<(\/?)([a-z][a-z0-9_:-]*)[^>]*>/gi;

function extractTagTokens(content: string): TagToken[] {
  const tokens: TagToken[] = [];
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(content)) !== null) {
    if (match[2] === undefined) continue; // comment / PI / CDATA
    const name = match[2].toLowerCase();
    if (!PTX_ELEMENTS.has(name)) continue;
    const isClose = match[1] === '/';
    const isSelfClose = !isClose && (match[0].endsWith('/>') || VOID_ELEMENTS.has(name));
    tokens.push({
      name,
      type: isClose ? 'close' : isSelfClose ? 'self-closing' : 'open',
      offset: match.index,
      tagLength: match[0].length,
    });
  }
  return tokens;
}

function offsetToPosition(content: string, offset: number): { lineNumber: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  const capped = Math.max(0, Math.min(offset, content.length));
  for (let i = 0; i < capped; i++) {
    if (content.charCodeAt(i) === 10) {
      line++;
      lastNewline = i;
    }
  }
  return { lineNumber: line, column: capped - lastNewline };
}

function makeIssue(
  content: string,
  offset: number,
  tagLength: number,
  message: string,
  severity: PtxValidationSeverity,
): PtxValidationIssue {
  const pos = offsetToPosition(content, offset);
  return {
    startLineNumber: pos.lineNumber,
    startColumn: pos.column,
    endLineNumber: pos.lineNumber,
    endColumn: pos.column + tagLength,
    message,
    severity,
    source: 'proofdesk-ptx',
  };
}

function findLastMatchingOpen(stack: StackEntry[], name: string): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].name === name) return i;
  }
  return -1;
}

function checkForbiddenNesting(
  token: TagToken,
  stack: StackEntry[],
  content: string,
  issues: PtxValidationIssue[],
): void {
  const ancestors = stack.map((e) => e.name);

  if (MATH_ELEMENTS.has(token.name) && ancestors.some((a) => MATH_ELEMENTS.has(a))) {
    issues.push(makeIssue(
      content, token.offset, token.tagLength,
      `<${token.name}> cannot be nested inside a math element`,
      'error',
    ));
    return;
  }

  if (BLOCK_ELEMENTS.has(token.name) && ancestors.includes('p')) {
    issues.push(makeIssue(
      content, token.offset, token.tagLength,
      `<${token.name}> cannot appear inside a <p>`,
      'error',
    ));
    return;
  }

  if (token.name === 'p' && ancestors.includes('p')) {
    issues.push(makeIssue(
      content, token.offset, token.tagLength,
      '<p> cannot be nested inside another <p>',
      'error',
    ));
    return;
  }

  if (token.name === 'title' && ancestors.includes('title')) {
    issues.push(makeIssue(
      content, token.offset, token.tagLength,
      '<title> cannot be nested inside another <title>',
      'error',
    ));
    return;
  }

  if (token.name === 'proof' && ancestors.includes('proof')) {
    issues.push(makeIssue(
      content, token.offset, token.tagLength,
      '<proof> cannot be nested inside another <proof>',
      'error',
    ));
  }
}

export const validatePtxBuffer = (content: string, filename: string): PtxValidationIssue[] => {
  if (!isPtxFile(filename)) return [];

  const tokens = extractTagTokens(content);
  const issues: PtxValidationIssue[] = [];
  const stack: StackEntry[] = [];

  for (const token of tokens) {
    if (token.type === 'self-closing') {
      checkForbiddenNesting(token, stack, content, issues);
      continue;
    }

    if (token.type === 'open') {
      checkForbiddenNesting(token, stack, content, issues);
      stack.push({ name: token.name, offset: token.offset, tagLength: token.tagLength });
      continue;
    }

    // close tag
    const matchIdx = findLastMatchingOpen(stack, token.name);
    if (matchIdx === -1) {
      issues.push(makeIssue(
        content, token.offset, token.tagLength,
        `</${token.name}> has no matching opening tag`,
        'error',
      ));
    } else if (matchIdx === stack.length - 1) {
      stack.pop();
    } else {
      // Intervening unclosed element
      const unclosed = stack[stack.length - 1];
      issues.push(makeIssue(
        content, unclosed.offset, unclosed.tagLength,
        `<${unclosed.name}> is not closed before </${token.name}>`,
        'error',
      ));
      // Recover by closing everything up to and including the matching open
      stack.splice(matchIdx);
    }
  }

  // Unclosed content-level elements — warn rather than error (fragment files are common)
  for (const entry of stack) {
    if (!CONTAINER_ELEMENTS.has(entry.name)) {
      issues.push(makeIssue(
        content, entry.offset, entry.tagLength,
        `<${entry.name}> is never closed`,
        'warning',
      ));
    }
  }

  return issues;
};
