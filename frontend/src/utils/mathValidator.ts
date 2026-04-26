import katex from 'katex';

export type MathValidationSeverity = 'error' | 'warning';

export interface MathValidationIssue {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: MathValidationSeverity;
  source: string;
}

interface MathSnippet {
  text: string;
  offset: number;
  displayMode: boolean;
}

const PRETEXT_MATH_TAGS = ['m', 'me', 'men', 'mrow'] as const;

const PRETEXT_EXTENSIONS = new Set(['xml', 'ptx']);
const LATEX_EXTENSIONS = new Set(['tex', 'ltx']);

const PRETEXT_ONLY_PATTERN = /\\(syseq|rlap|amp|lt|gt|nbsp)\b|\\\.|\\\+/;

const getFileExtension = (filename: string): string => {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
};

export const isMathValidatableFile = (filename: string | undefined | null): boolean => {
  if (!filename) return false;
  const ext = getFileExtension(filename);
  return PRETEXT_EXTENSIONS.has(ext) || LATEX_EXTENSIONS.has(ext);
};

const offsetToPosition = (
  content: string,
  offset: number,
): { lineNumber: number; column: number } => {
  let line = 1;
  let lastNewline = -1;
  const capped = Math.max(0, Math.min(offset, content.length));
  for (let i = 0; i < capped; i++) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
      lastNewline = i;
    }
  }
  return { lineNumber: line, column: capped - lastNewline };
};

const extractPreTeXtSnippets = (content: string): MathSnippet[] => {
  const snippets: MathSnippet[] = [];
  for (const tag of PRETEXT_MATH_TAGS) {
    const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const inner = match[1];
      const innerStart = match.index + match[0].indexOf(inner);
      snippets.push({
        text: inner,
        offset: innerStart,
        displayMode: tag !== 'm',
      });
    }
  }
  return snippets;
};

const extractLatexDelimiterSnippets = (content: string): MathSnippet[] => {
  const snippets: MathSnippet[] = [];
  const patterns: Array<{ regex: RegExp; displayMode: boolean }> = [
    { regex: /\\\(([\s\S]*?)\\\)/g, displayMode: false },
    { regex: /\\\[([\s\S]*?)\\\]/g, displayMode: true },
  ];
  for (const { regex, displayMode } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      snippets.push({
        text: match[1],
        offset: match.index + 2,
        displayMode,
      });
    }
  }
  return snippets;
};

export const extractMathSnippets = (
  content: string,
  filename: string,
): MathSnippet[] => {
  const ext = getFileExtension(filename);
  if (PRETEXT_EXTENSIONS.has(ext)) {
    return [
      ...extractPreTeXtSnippets(content),
      ...extractLatexDelimiterSnippets(content),
    ];
  }
  if (LATEX_EXTENSIONS.has(ext)) {
    return extractLatexDelimiterSnippets(content);
  }
  return [];
};

interface KatexParseError {
  message?: string;
  position?: number;
  length?: number;
  rawMessage?: string;
}

export const validateSnippet = (
  snippet: MathSnippet,
): { message: string; localOffset: number; localLength: number } | null => {
  if (PRETEXT_ONLY_PATTERN.test(snippet.text)) {
    return null;
  }
  try {
    katex.renderToString(snippet.text, {
      throwOnError: true,
      displayMode: snippet.displayMode,
      strict: false,
      trust: false,
    });
    return null;
  } catch (err) {
    const parseError = err as KatexParseError;
    const rawMessage = parseError.rawMessage ?? parseError.message ?? 'Math parse error';
    const localOffset = Math.max(0, Math.min(parseError.position ?? 0, snippet.text.length));
    const localLength = Math.max(1, parseError.length ?? 1);
    return {
      message: rawMessage.replace(/^KaTeX parse error:\s*/i, ''),
      localOffset,
      localLength,
    };
  }
};

export const validateMathInBuffer = (
  content: string,
  filename: string,
): MathValidationIssue[] => {
  if (!isMathValidatableFile(filename)) return [];
  const snippets = extractMathSnippets(content, filename);
  const issues: MathValidationIssue[] = [];
  for (const snippet of snippets) {
    const result = validateSnippet(snippet);
    if (!result) continue;
    const start = offsetToPosition(content, snippet.offset + result.localOffset);
    const end = offsetToPosition(
      content,
      snippet.offset + result.localOffset + result.localLength,
    );
    issues.push({
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
      message: result.message,
      severity: 'error',
      source: 'proofdesk-math',
    });
  }
  return issues;
};
