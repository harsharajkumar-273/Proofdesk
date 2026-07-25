/**
 * Line-level diff used by the PDF/LaTeX import preview.
 *
 * The importer turns a source document into a PreTeXt XML draft. Showing that
 * draft as a plain blob makes it hard to see what the conversion actually
 * produced, so the preview renders it as a changeset instead:
 *
 *  - converting pasted LaTeX gives a genuine before/after — the source on one
 *    side, the generated PreTeXt on the other;
 *  - converting a PDF has no textual "before", so every line is an addition,
 *    which is exactly what will be inserted.
 *
 * Deliberately kept independent of the editor's cursor position. The preview
 * only ever claims what it can prove: the content of the draft itself. It does
 * not try to simulate the result of inserting at an arbitrary cursor offset,
 * because a preview that disagrees with what actually happens is worse than no
 * preview at all.
 */

export type DiffRowType = 'add' | 'remove' | 'context';

export interface DiffRow {
  type: DiffRowType;
  /** Line content, without its trailing newline. */
  text: string;
  /** 1-based line number on the "before" side, when the row exists there. */
  oldLine: number | null;
  /** 1-based line number on the "after" side, when the row exists there. */
  newLine: number | null;
}

export interface DiffSummary {
  added: number;
  removed: number;
  unchanged: number;
}

export interface DiffResult {
  rows: DiffRow[];
  summary: DiffSummary;
  /**
   * True when the inputs were too large to diff precisely and the result is a
   * whole-block replacement rather than a line-by-line comparison.
   */
  truncated: boolean;
}

/**
 * Above this many lines on either side, the quadratic LCS table becomes an
 * unreasonable amount of work for a preview pane, so the comparison degrades
 * to a whole-block replacement and flags itself as truncated.
 */
const MAX_DIFF_LINES = 2000;

/** Splits text into lines, treating empty input as zero lines rather than one. */
export const splitLines = (text: string): string[] => {
  if (text === '') return [];
  // Normalise CRLF so a Windows-authored source does not diff as entirely
  // changed against LF output.
  return text.replace(/\r\n/g, '\n').split('\n');
};

const emptySummary = (): DiffSummary => ({ added: 0, removed: 0, unchanged: 0 });

const summarize = (rows: DiffRow[]): DiffSummary => {
  const summary = emptySummary();
  for (const row of rows) {
    if (row.type === 'add') summary.added += 1;
    else if (row.type === 'remove') summary.removed += 1;
    else summary.unchanged += 1;
  }
  return summary;
};

/** Builds the whole-block replacement used for empty or oversized inputs. */
const wholeBlockDiff = (before: string[], after: string[], truncated: boolean): DiffResult => {
  const rows: DiffRow[] = [
    ...before.map((text, i) => ({
      type: 'remove' as const,
      text,
      oldLine: i + 1,
      newLine: null,
    })),
    ...after.map((text, i) => ({
      type: 'add' as const,
      text,
      oldLine: null,
      newLine: i + 1,
    })),
  ];
  return { rows, summary: summarize(rows), truncated };
};

/**
 * Computes a line-level diff between two texts.
 *
 * Uses a standard longest-common-subsequence table, which is more than fast
 * enough for preview-sized documents and produces a stable, readable result.
 */
export const diffLines = (before: string, after: string): DiffResult => {
  const a = splitLines(before);
  const b = splitLines(after);

  if (a.length === 0 || b.length === 0) {
    return wholeBlockDiff(a, b, false);
  }

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return wholeBlockDiff(a, b, true);
  }

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ type: 'context', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ type: 'remove', text: a[i], oldLine: i + 1, newLine: null });
      i += 1;
    } else {
      rows.push({ type: 'add', text: b[j], oldLine: null, newLine: j + 1 });
      j += 1;
    }
  }

  while (i < a.length) {
    rows.push({ type: 'remove', text: a[i], oldLine: i + 1, newLine: null });
    i += 1;
  }

  while (j < b.length) {
    rows.push({ type: 'add', text: b[j], oldLine: null, newLine: j + 1 });
    j += 1;
  }

  return { rows, summary: summarize(rows), truncated: false };
};

/** Renders a short human summary such as "42 added, 3 removed". */
export const formatDiffSummary = (summary: DiffSummary): string => {
  const parts: string[] = [];
  if (summary.added > 0) parts.push(`${summary.added} added`);
  if (summary.removed > 0) parts.push(`${summary.removed} removed`);
  if (parts.length === 0) return 'No changes';
  return parts.join(', ');
};

/** Bytes to a short human-readable size, for upload limit messaging. */
export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Maximum upload size, mirroring the backend's multer limit (15 MB). */
export const MAX_IMPORT_FILE_BYTES = 15 * 1024 * 1024;

export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validates a dropped or selected file before uploading.
 *
 * The backend caps uploads at 15 MB via multer. Without a client-side check a
 * larger file is uploaded in full only to be rejected, and multer's rejection
 * is not JSON, so the pane's error handling cannot read it. Checking here
 * fails fast with a message that actually says what went wrong.
 */
export const validateImportFile = (file: File | null | undefined): FileValidationResult => {
  if (!file) return { ok: false, error: 'No file selected.' };

  const isPdfType = file.type === 'application/pdf';
  const isPdfName = file.name.toLowerCase().endsWith('.pdf');
  if (!isPdfType && !isPdfName) {
    return { ok: false, error: `"${file.name}" is not a PDF. Please choose a PDF document.` };
  }

  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return {
      ok: false,
      error: `"${file.name}" is ${formatFileSize(file.size)}. The maximum upload size is ${formatFileSize(MAX_IMPORT_FILE_BYTES)}.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, error: `"${file.name}" is empty.` };
  }

  return { ok: true };
};

/**
 * Picks the first usable PDF out of a drop event's payload.
 *
 * Browsers vary in whether they populate `files` or `items`, and a drop may
 * contain directories or several files, so this normalises to a single
 * candidate rather than assuming `files[0]` exists.
 */
export const extractDroppedFile = (dataTransfer: DataTransfer | null): File | null => {
  if (!dataTransfer) return null;

  const fromFiles = Array.from(dataTransfer.files ?? []);
  if (fromFiles.length > 0) {
    const pdf = fromFiles.find(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
    );
    return pdf ?? fromFiles[0];
  }

  const items = Array.from(dataTransfer.items ?? []);
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) return file;
  }

  return null;
};
