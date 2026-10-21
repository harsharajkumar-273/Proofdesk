import fs from 'fs/promises';
import path from 'path';
import { resolveContainedPath } from '../utils/pathContainment.js';

/** Lines of source shown on each side of a reported error line. */
const CONTEXT_RADIUS = 6;
/** At most this many distinct locations are looked up per log. */
const MAX_SNIPPETS = 3;
/** Source files larger than this are skipped rather than read into memory. */
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
/** Long lines (minified data, base64 images) are cut so one line cannot crowd out the rest. */
const MAX_LINE_CHARS = 300;

export interface SourceSnippet {
  /** Repository-relative POSIX path, the same form the editor opens files by. */
  path: string;
  /** 1-based line the log points at. */
  line: number;
  /** Numbered source lines around `line`, the reported line marked with `>`. */
  text: string;
}

export interface LogLocation {
  rawPath: string;
  line: number;
}

// "chapters/ch1.xml:42: parser error ..." (lxml, xmllint, xsltproc, LaTeX -file-line-error)
const COLON_LOCATION = /([^\s|>"'(),:]+\.(?:xml|ptx|tex))[:](\d+)\b/gi;
// "... (ch1.xml, line 42)" (Python's XMLSyntaxError) and 'File "ch1.xml", line 42'
const WORDED_LOCATION = /["(]?([^\s|>"'(),:]+\.(?:xml|ptx|tex))"?,\s*line\s+(\d+)\b/gi;

/** Source locations a build log names, first occurrence first, without duplicates. */
export const findLogLocations = (log: string): LogLocation[] => {
  const found: Array<LogLocation & { index: number }> = [];
  for (const pattern of [COLON_LOCATION, WORDED_LOCATION]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(log)) !== null) {
      const line = Number.parseInt(match[2], 10);
      if (line >= 1 && line <= 1_000_000) {
        found.push({ rawPath: match[1], line, index: match.index });
      }
    }
  }

  const seen = new Set<string>();
  return found
    .sort((a, b) => a.index - b.index)
    .filter(({ rawPath, line }) => {
      const key = `${rawPath}:${line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ rawPath, line }) => ({ rawPath, line }));
};

/**
 * Maps a path as printed by the build (often absolute inside the build
 * container, or relative to a source subdirectory) onto a file in the
 * repository. Tries the longest suffix of the printed path first.
 */
export const resolveLogPath = async (repoRoot: string, rawPath: string): Promise<string | null> => {
  const segments = rawPath.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.');
  if (segments.includes('..')) return null;

  for (let start = 0; start < segments.length; start += 1) {
    const relative = segments.slice(start).join('/');
    try {
      const absolute = await resolveContainedPath(repoRoot, relative);
      const stat = await fs.stat(absolute);
      if (stat.isFile() && stat.size <= MAX_SOURCE_BYTES) {
        return path.relative(path.resolve(repoRoot), absolute).split(path.sep).join('/');
      }
    } catch {
      // Not inside the repository, or not there: try a shorter suffix.
    }
  }
  return null;
};

const formatSnippet = (lines: string[], line: number): string => {
  const first = Math.max(1, line - CONTEXT_RADIUS);
  const last = Math.min(lines.length, line + CONTEXT_RADIUS);
  const width = String(last).length;
  const out: string[] = [];
  for (let n = first; n <= last; n += 1) {
    const raw = lines[n - 1] ?? '';
    const text = raw.length > MAX_LINE_CHARS ? `${raw.slice(0, MAX_LINE_CHARS)}…` : raw;
    out.push(`${n === line ? '>' : ' '} ${String(n).padStart(width)} | ${text}`);
  }
  return out.join('\n');
};

/**
 * Reads the source around each location the log names, so the explainer sees
 * the actual markup rather than only a line number. Locations that do not
 * resolve to a file inside the repository are skipped.
 */
export const collectSourceContext = async (repoRoot: string | undefined, log: string): Promise<SourceSnippet[]> => {
  if (!repoRoot) return [];

  const snippets: SourceSnippet[] = [];
  const fileCache = new Map<string, string[] | null>();

  for (const { rawPath, line } of findLogLocations(log)) {
    if (snippets.length >= MAX_SNIPPETS) break;

    const relative = await resolveLogPath(repoRoot, rawPath);
    if (!relative) continue;
    if (snippets.some((s) => s.path === relative && Math.abs(s.line - line) <= CONTEXT_RADIUS)) continue;

    if (!fileCache.has(relative)) {
      try {
        const content = await fs.readFile(path.join(repoRoot, relative), 'utf8');
        fileCache.set(relative, content.replace(/\r\n/g, '\n').split('\n'));
      } catch {
        fileCache.set(relative, null);
      }
    }
    const lines = fileCache.get(relative);
    if (!lines || line > lines.length) continue;

    snippets.push({ path: relative, line, text: formatSnippet(lines, line) });
  }

  return snippets;
};
