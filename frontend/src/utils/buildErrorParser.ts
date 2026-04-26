import type { Diagnostic } from '../components/editor/EditorProblemsPane';

// Matches "path/to/file.xml:42: message" or "path/to/file.xml:42:5: message"
// Handles .xml, .ptx, .tex, .py source files produced by the SCons/PreTeXt pipeline.
const LINE_RE = /([^\s|>"']+\.(?:xml|ptx|tex|py))[: ](\d+)(?::(\d+))?:?\s+([^\n]{3,})/g;

function classifySeverity(msg: string): 'error' | 'warning' {
  const m = msg.toLowerCase();
  if (m.includes('error') || m.includes('fatal') || m.includes('undefined control sequence')) {
    return 'error';
  }
  return 'warning';
}

/**
 * Parse PreTeXt / SCons build output into structured diagnostics.
 * Matches common patterns from xsltproc, pdflatex, and Python traceback output.
 * Only returns diagnostics for files currently open in the editor.
 */
export function parseBuildErrors(
  stdout: string,
  stderr: string,
  openFilePaths: string[],
): Omit<Diagnostic, 'fileName'>[] {
  // Build a fast lookup: basename → full open path
  const byName = new Map<string, string>();
  for (const p of openFilePaths) {
    const base = p.split('/').pop()!;
    byName.set(base, p);
  }

  const combined = [stderr, stdout].filter(Boolean).join('\n');
  const results: Omit<Diagnostic, 'fileName'>[] = [];
  const seen = new Set<string>();

  LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINE_RE.exec(combined)) !== null) {
    const [, rawPath, lineStr, colStr, msg] = m;
    const lineNum = parseInt(lineStr, 10);
    if (!lineNum || lineNum < 1 || lineNum > 99_999) continue;

    const base = rawPath.split('/').pop()!;
    // Only emit diagnostics for files the user has open
    const resolvedPath = byName.get(base);
    if (!resolvedPath) continue;

    const col = colStr ? parseInt(colStr, 10) : 1;
    const severity = classifySeverity(msg);

    const key = `${resolvedPath}:${lineNum}:${msg.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      filePath: resolvedPath,
      startLineNumber: lineNum,
      startColumn: col,
      endLineNumber: lineNum,
      endColumn: col + 200,
      message: msg.trim(),
      severity,
      source: 'build',
    });
  }

  return results;
}
