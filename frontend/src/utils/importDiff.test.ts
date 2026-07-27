import { describe, it, expect } from 'vitest';
import {
  diffLines,
  splitLines,
  formatDiffSummary,
  formatFileSize,
  validateImportFile,
  extractDroppedFile,
  MAX_IMPORT_FILE_BYTES,
} from './importDiff';

/** Compact rendering of a diff, for readable assertions. */
const render = (before: string, after: string): string[] =>
  diffLines(before, after).rows.map((r) => {
    const sign = r.type === 'add' ? '+' : r.type === 'remove' ? '-' : ' ';
    return `${sign}${r.text}`;
  });

/** Builds a File without depending on a real filesystem. */
const makeFile = (name: string, type: string, size: number): File => {
  const file = new File(['x'], name, { type });
  // File.size is read-only; redefine it so oversize cases can be exercised
  // without allocating megabytes in a test.
  Object.defineProperty(file, 'size', { value: size, configurable: true });
  return file;
};

describe('splitLines', () => {
  it('treats empty input as zero lines', () => {
    expect(splitLines('')).toEqual([]);
  });

  it('splits on newlines', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('normalises CRLF so Windows sources do not diff as fully changed', () => {
    expect(splitLines('a\r\nb')).toEqual(['a', 'b']);
  });

  it('preserves trailing empty lines', () => {
    expect(splitLines('a\n')).toEqual(['a', '']);
  });
});

describe('diffLines', () => {
  it('reports every line as an addition when there is no before text', () => {
    const result = diffLines('', '<p>one</p>\n<p>two</p>');
    expect(result.rows.every((r) => r.type === 'add')).toBe(true);
    expect(result.summary).toEqual({ added: 2, removed: 0, unchanged: 0 });
  });

  it('reports every line as a removal when there is no after text', () => {
    const result = diffLines('gone\nalso gone', '');
    expect(result.rows.every((r) => r.type === 'remove')).toBe(true);
    expect(result.summary.removed).toBe(2);
  });

  it('returns no rows when both sides are empty', () => {
    const result = diffLines('', '');
    expect(result.rows).toEqual([]);
    expect(result.summary).toEqual({ added: 0, removed: 0, unchanged: 0 });
  });

  it('marks identical text as entirely unchanged', () => {
    const result = diffLines('same\nlines', 'same\nlines');
    expect(result.rows.every((r) => r.type === 'context')).toBe(true);
    expect(result.summary).toEqual({ added: 0, removed: 0, unchanged: 2 });
  });

  it('detects a single changed line while keeping surrounding context', () => {
    expect(render('a\nb\nc', 'a\nB\nc')).toEqual([' a', '-b', '+B', ' c']);
  });

  it('detects a pure insertion in the middle', () => {
    expect(render('a\nc', 'a\nb\nc')).toEqual([' a', '+b', ' c']);
  });

  it('detects a pure deletion in the middle', () => {
    expect(render('a\nb\nc', 'a\nc')).toEqual([' a', '-b', ' c']);
  });

  it('handles a full replacement', () => {
    const result = diffLines('old', 'new');
    expect(result.summary.added).toBe(1);
    expect(result.summary.removed).toBe(1);
    expect(result.summary.unchanged).toBe(0);
  });

  it('numbers old and new lines independently', () => {
    const result = diffLines('a\nc', 'a\nb\nc');
    const added = result.rows.find((r) => r.type === 'add');
    const lastContext = result.rows.filter((r) => r.type === 'context').pop();
    expect(added?.oldLine).toBeNull();
    expect(added?.newLine).toBe(2);
    // "c" is line 2 before and line 3 after.
    expect(lastContext?.oldLine).toBe(2);
    expect(lastContext?.newLine).toBe(3);
  });

  it('never assigns a new-line number to a removal', () => {
    const result = diffLines('a\nb', 'a');
    for (const row of result.rows) {
      if (row.type === 'remove') expect(row.newLine).toBeNull();
      if (row.type === 'add') expect(row.oldLine).toBeNull();
    }
  });

  it('produces rows whose additions reconstruct the after text exactly', () => {
    const before = 'alpha\nbeta\ngamma';
    const after = 'alpha\ndelta\ngamma\nepsilon';
    const result = diffLines(before, after);
    const rebuilt = result.rows
      .filter((r) => r.type === 'add' || r.type === 'context')
      .map((r) => r.text)
      .join('\n');
    expect(rebuilt).toBe(after);
  });

  it('produces rows whose removals reconstruct the before text exactly', () => {
    const before = 'alpha\nbeta\ngamma';
    const after = 'alpha\ndelta\ngamma\nepsilon';
    const result = diffLines(before, after);
    const rebuilt = result.rows
      .filter((r) => r.type === 'remove' || r.type === 'context')
      .map((r) => r.text)
      .join('\n');
    expect(rebuilt).toBe(before);
  });

  it('degrades to a whole-block replacement for oversized inputs', () => {
    const big = Array.from({ length: 2100 }, (_, i) => `line ${i}`).join('\n');
    const result = diffLines(big, big);
    expect(result.truncated).toBe(true);
    // Identical input, but truncated mode does not attempt line matching.
    expect(result.summary.unchanged).toBe(0);
  });

  it('does not flag normal-sized inputs as truncated', () => {
    expect(diffLines('a', 'b').truncated).toBe(false);
  });
});

describe('formatDiffSummary', () => {
  it('describes additions only', () => {
    expect(formatDiffSummary({ added: 42, removed: 0, unchanged: 3 })).toBe('42 added');
  });

  it('describes both directions', () => {
    expect(formatDiffSummary({ added: 2, removed: 1, unchanged: 0 })).toBe('2 added, 1 removed');
  });

  it('reports no changes when nothing differs', () => {
    expect(formatDiffSummary({ added: 0, removed: 0, unchanged: 9 })).toBe('No changes');
  });
});

describe('formatFileSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('handles nonsense input without throwing', () => {
    expect(formatFileSize(-1)).toBe('0 B');
    expect(formatFileSize(Number.NaN)).toBe('0 B');
  });
});

describe('validateImportFile', () => {
  it('accepts a normal PDF', () => {
    expect(validateImportFile(makeFile('ch1.pdf', 'application/pdf', 1024))).toEqual({ ok: true });
  });

  it('accepts a PDF identified only by extension', () => {
    expect(validateImportFile(makeFile('ch1.PDF', '', 1024)).ok).toBe(true);
  });

  it('rejects a non-PDF', () => {
    const result = validateImportFile(makeFile('notes.txt', 'text/plain', 10));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not a PDF');
  });

  it('rejects a file over the backend limit', () => {
    const result = validateImportFile(
      makeFile('huge.pdf', 'application/pdf', MAX_IMPORT_FILE_BYTES + 1),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain('maximum upload size');
  });

  it('accepts a file exactly at the limit', () => {
    expect(
      validateImportFile(makeFile('edge.pdf', 'application/pdf', MAX_IMPORT_FILE_BYTES)).ok,
    ).toBe(true);
  });

  it('rejects an empty file', () => {
    const result = validateImportFile(makeFile('empty.pdf', 'application/pdf', 0));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects a missing file', () => {
    expect(validateImportFile(null).ok).toBe(false);
    expect(validateImportFile(undefined).ok).toBe(false);
  });
});

describe('extractDroppedFile', () => {
  const asDataTransfer = (value: unknown) => value as DataTransfer;

  it('returns null when there is no payload', () => {
    expect(extractDroppedFile(null)).toBeNull();
  });

  it('picks the PDF out of a multi-file drop', () => {
    const txt = makeFile('a.txt', 'text/plain', 10);
    const pdf = makeFile('b.pdf', 'application/pdf', 10);
    const dt = asDataTransfer({ files: [txt, pdf], items: [] });
    expect(extractDroppedFile(dt)?.name).toBe('b.pdf');
  });

  it('falls back to the first file when none is a PDF, so the caller can report why', () => {
    const txt = makeFile('a.txt', 'text/plain', 10);
    const dt = asDataTransfer({ files: [txt], items: [] });
    expect(extractDroppedFile(dt)?.name).toBe('a.txt');
  });

  it('reads from items when files is empty', () => {
    const pdf = makeFile('c.pdf', 'application/pdf', 10);
    const dt = asDataTransfer({
      files: [],
      items: [{ kind: 'file', getAsFile: () => pdf }],
    });
    expect(extractDroppedFile(dt)?.name).toBe('c.pdf');
  });

  it('ignores non-file items such as dragged text', () => {
    const dt = asDataTransfer({
      files: [],
      items: [{ kind: 'string', getAsFile: () => null }],
    });
    expect(extractDroppedFile(dt)).toBeNull();
  });

  it('survives a payload with neither files nor items', () => {
    expect(extractDroppedFile(asDataTransfer({}))).toBeNull();
  });
});
