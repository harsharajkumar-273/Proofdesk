import type { Diagnostic } from '../components/editor/EditorProblemsPane';

// Matches "path/to/file.xml:42: message" or "path/to/file.xml:42:5: message"
// Handles .xml, .ptx, .tex, .py source files produced by the SCons/PreTeXt pipeline.
const LINE_RE = /([^\s|>"']+\.(?:xml|ptx|tex|py))[: ](\d+)(?::(\d+))?:?\s+([^\n]{3,})/g;

const humanizeBuildIssue = (rawMessage: string) => {
  const message = String(rawMessage || '').trim();
  const lower = message.toLowerCase();

  if (lower.includes('opening and ending tag mismatch') || lower.includes('mismatched tag')) {
    return {
      message: 'XML tags do not close in the same order they were opened.',
      hint: 'Check the nearest open and closing tags around this line and make sure each element closes with the matching name.',
      code: 'xml_tag_mismatch',
      severity: 'error' as const,
    };
  }

  if (lower.includes('premature end of data') || lower.includes('document is empty') || lower.includes('extra content at the end')) {
    return {
      message: 'The XML structure is incomplete or has extra content after the root element.',
      hint: 'Look for a missing closing tag, an accidental duplicate root block, or pasted content outside the main document structure.',
      code: 'xml_structure_invalid',
      severity: 'error' as const,
    };
  }

  if (lower.includes('undefined control sequence')) {
    return {
      message: 'LaTeX contains a command the build toolchain does not recognize.',
      hint: 'Check the math command near this line for a typo or a macro that is not defined in the textbook toolchain.',
      code: 'latex_undefined_control_sequence',
      severity: 'error' as const,
    };
  }

  if (lower.includes('no such file or directory') || lower.includes('cannot open')) {
    return {
      message: 'The build could not find a referenced file.',
      hint: 'Verify include paths, image names, and referenced assets. A renamed or moved file often causes this.',
      code: 'missing_dependency',
      severity: 'error' as const,
    };
  }

  if (lower.includes('traceback') || lower.includes('exception') || lower.includes('error:')) {
    return {
      message,
      hint: 'A build script failed while processing this file. Start with the first error near this line, because later traceback lines are often downstream noise.',
      code: 'build_script_failure',
      severity: 'error' as const,
    };
  }

  return {
    message,
    hint: lower.includes('warning')
      ? 'This warning may not stop the build, but it is worth checking before publishing.'
      : 'Review the source near this line and retry the build after correcting the issue.',
    code: 'generic_build_issue',
    severity: classifySeverity(message),
  };
};

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
    const normalized = humanizeBuildIssue(msg);
    const severity = normalized.severity;

    const key = `${resolvedPath}:${lineNum}:${msg.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      filePath: resolvedPath,
      startLineNumber: lineNum,
      startColumn: col,
      endLineNumber: lineNum,
      endColumn: col + 200,
      message: normalized.message,
      severity,
      source: 'build',
      hint: normalized.hint,
      code: normalized.code,
    });
  }

  return results;
}
