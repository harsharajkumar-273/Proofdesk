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
/** Bounds on the repository walk used to find an undefined LaTeX macro. */
const MAX_SEARCH_FILES = 2_000;
const SKIPPED_DIRS = new Set(['.git', 'node_modules', 'output', 'generated-assets', '.proofdesk-data']);
const SOURCE_EXTENSIONS = new Set(['.xml', '.ptx']);

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

// "! Undefined control sequence." then TeX's "l.1180 <text up to the bad macro>"
const UNDEFINED_MACRO = /Undefined control sequence\.?[^\n]*\n(?:[^\n]*\n){0,4}?l\.\d+ ([^\n]*)/g;

/**
 * Macros LaTeX reported as undefined. TeX prints the source line up to and
 * including the offending command, so it is the last command on that line.
 */
export const findUndefinedMacros = (log: string): string[] => {
  const macros: string[] = [];
  UNDEFINED_MACRO.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = UNDEFINED_MACRO.exec(log)) !== null) {
    const commands = match[1].match(/\\[A-Za-z]+/g);
    const macro = commands?.[commands.length - 1];
    if (macro && !macros.includes(macro)) macros.push(macro);
  }
  return macros;
};

/** Repository-relative paths of PreTeXt source files, walked without following symlinks. */
const listSourceFiles = async (repoRoot: string): Promise<string[]> => {
  const found: string[] = [];
  const pending = [''];
  while (pending.length > 0 && found.length < MAX_SEARCH_FILES) {
    const relativeDir = pending.shift() as string;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(path.join(repoRoot, relativeDir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) pending.push(relative);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) found.push(relative);
    }
  }
  return found;
};

/**
 * LaTeX errors point at the generated .tex file, which the author never edits.
 * For an undefined macro, find where the author's source uses it instead.
 */
const locateMacroUses = async (repoRoot: string, macros: string[], limit: number): Promise<LogLocation[]> => {
  if (macros.length === 0 || limit <= 0) return [];
  const hits: LogLocation[] = [];
  const patterns = macros.map((macro) => new RegExp(`${macro.replace(/\\/g, '\\\\')}(?![A-Za-z])`));

  for (const file of await listSourceFiles(repoRoot)) {
    if (hits.length >= limit) break;
    try {
      const stat = await fs.stat(path.join(repoRoot, file));
      if (stat.size > MAX_SOURCE_BYTES) continue;
      const lines = (await fs.readFile(path.join(repoRoot, file), 'utf8')).split('\n');
      for (const pattern of patterns) {
        const index = lines.findIndex((text) => pattern.test(text));
        if (index >= 0 && hits.length < limit) hits.push({ rawPath: file, line: index + 1 });
      }
    } catch {
      // Unreadable file: skip it.
    }
  }
  return hits;
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

  // Locations in generated LaTeX are dropped by resolveLogPath (the file is not
  // in the repository), so undefined macros are looked up in the source.
  const named = findLogLocations(log);
  const macroUses = await locateMacroUses(repoRoot, findUndefinedMacros(log), MAX_SNIPPETS);

  for (const { rawPath, line } of [...named, ...macroUses]) {
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
