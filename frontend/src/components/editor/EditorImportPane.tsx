import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  UploadCloud,
  FileText,
  RefreshCw,
  Check,
  AlertTriangle,
  FileCode,
  ArrowRight,
  Sparkles,
  GitCompare,
  Code2,
} from 'lucide-react';
import {
  diffLines,
  formatDiffSummary,
  formatFileSize,
  validateImportFile,
  extractDroppedFile,
  type DiffRow,
} from '../../utils/importDiff';

interface EditorImportPaneProps {
  sessionId: string | null;
  apiUrl: string;
  onInsertAtCursor: (text: string) => void;
  onCreateNewFile: (fileName: string, content: string) => Promise<void>;
  activeTabOpen: boolean;
}

/**
 * Reads an error body that may not be JSON.
 *
 * Multer rejects oversized uploads before the route handler runs, so the
 * response is Express's default error output rather than the controller's JSON
 * shape. Calling `res.json()` on that throws, which surfaced a JSON parse error
 * instead of the real problem.
 */
const readErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  const body = await response.text();
  if (!body) return `${fallback} (HTTP ${response.status})`;

  try {
    const parsed = JSON.parse(body) as { error?: string; details?: string };
    return parsed.details || parsed.error || `${fallback} (HTTP ${response.status})`;
  } catch {
    // Not JSON — surface a short readable prefix rather than raw HTML.
    const stripped = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!stripped) return `${fallback} (HTTP ${response.status})`;
    return stripped.length > 180 ? `${stripped.slice(0, 180)}…` : stripped;
  }
};

const EditorImportPane: React.FC<EditorImportPaneProps> = ({
  apiUrl,
  onInsertAtCursor,
  onCreateNewFile,
  activeTabOpen,
}) => {
  const [activeTab, setActiveTab] = useState<'pdf' | 'latex'>('pdf');
  const [latexInput, setLatexInput] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertedXml, setConvertedXml] = useState('');
  /** The text the draft was generated from, so the preview can diff against it. */
  const [conversionSource, setConversionSource] = useState('');
  const [previewMode, setPreviewMode] = useState<'diff' | 'raw'>('diff');
  const [mathPixConfigured, setMathPixConfigured] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [insertSuccess, setInsertSuccess] = useState(false);
  const [newFileName, setNewFileName] = useState('src/imported-pretext.xml');
  const [creatingFile, setCreatingFile] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const insertTimerRef = useRef<number | null>(null);
  /**
   * Drag events fire for every child element, so a plain enter/leave pair
   * flickers. Counting depth keeps the highlight stable.
   */
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();

    const fetchConfig = async () => {
      try {
        const res = await fetch(`${apiUrl}/import/config`, {
          // The backend authenticates via an httpOnly session cookie and sets
          // cors({ credentials: true }). The frontend runs on a different
          // origin, so the cookie is only sent when this is explicit.
          credentials: 'include',
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { mathPixConfigured: boolean };
          setMathPixConfigured(data.mathPixConfigured);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        console.warn('Failed to fetch import config:', err);
      }
    };

    void fetchConfig();
    return () => controller.abort();
  }, [apiUrl]);

  useEffect(
    () => () => {
      if (insertTimerRef.current !== null) window.clearTimeout(insertTimerRef.current);
    },
    [],
  );

  /** Validates and stores a candidate file from either the picker or a drop. */
  const acceptFile = useCallback((file: File | null) => {
    const validation = validateImportFile(file);
    if (!validation.ok) {
      setPdfFile(null);
      setError(validation.error ?? 'That file cannot be imported.');
      return;
    }
    setPdfFile(file);
    setError(null);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0] ?? null);
    // Reset so selecting the same file twice still fires a change event.
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    // Without preventDefault the browser navigates to the dropped file.
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    acceptFile(extractDroppedFile(e.dataTransfer));
  };

  const handleConvertText = async () => {
    if (!latexInput.trim()) {
      setError('Please paste some LaTeX or Markdown content.');
      return;
    }
    setConverting(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/import/text`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: latexInput }),
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to convert text content'));
      }

      const data = (await res.json()) as { success: boolean; pretext: string };
      setConvertedXml(data.pretext);
      setConversionSource(latexInput);
      setPreviewMode('diff');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Text conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const handleConvertPdf = async () => {
    const validation = validateImportFile(pdfFile);
    if (!validation.ok) {
      setError(validation.error ?? 'Please select a PDF file first.');
      return;
    }
    setConverting(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', pdfFile as File);

    try {
      const res = await fetch(`${apiUrl}/import/pdf`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Failed to convert PDF file'));
      }

      const data = (await res.json()) as { success: boolean; pretext: string };
      setConvertedXml(data.pretext);
      // A PDF has no textual "before", so the draft shows as all additions.
      setConversionSource('');
      setPreviewMode('diff');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'PDF conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const handleInsertAtCursor = () => {
    if (!convertedXml) return;
    onInsertAtCursor(convertedXml);
    setInsertSuccess(true);
    if (insertTimerRef.current !== null) window.clearTimeout(insertTimerRef.current);
    insertTimerRef.current = window.setTimeout(() => setInsertSuccess(false), 2000);
  };

  const handleCreateNewFile = async () => {
    if (!convertedXml || !newFileName.trim()) return;
    setCreatingFile(true);
    setError(null);
    try {
      await onCreateNewFile(newFileName.trim(), convertedXml);
      setConvertedXml('');
      setConversionSource('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to create file');
    } finally {
      setCreatingFile(false);
    }
  };

  const diff = useMemo(
    () => (convertedXml ? diffLines(conversionSource, convertedXml) : null),
    [conversionSource, convertedXml],
  );

  const renderDiffRow = (row: DiffRow, index: number) => {
    const tone =
      row.type === 'add'
        ? 'bg-emerald-500/10 text-emerald-300'
        : row.type === 'remove'
          ? 'bg-rose-500/10 text-rose-300'
          : 'text-zinc-400';
    const sign = row.type === 'add' ? '+' : row.type === 'remove' ? '-' : ' ';

    return (
      <div key={index} className={`flex gap-2 px-2 leading-5 ${tone}`}>
        <span className="w-8 flex-shrink-0 select-none text-right text-zinc-600 tabular-nums">
          {row.oldLine ?? ''}
        </span>
        <span className="w-8 flex-shrink-0 select-none text-right text-zinc-600 tabular-nums">
          {row.newLine ?? ''}
        </span>
        <span aria-hidden="true" className="w-2 flex-shrink-0 select-none">
          {sign}
        </span>
        <span className="whitespace-pre-wrap break-words">{row.text || '\u00A0'}</span>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
      <div className="flex flex-col gap-1 p-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <span>Import PDF / LaTeX</span>
        </h2>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Convert existing mathematical course documents into clean PreTeXt markup.
        </p>
      </div>

      {!mathPixConfigured && (
        <div className="mx-4 mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl text-amber-700 dark:text-amber-300 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Mock Mode Active:</span> MathPix credentials are missing in the backend environment. Uploading any PDF will convert a simulated linear algebra sample chapter for demo preview.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex px-4 pt-3 border-b border-zinc-200 dark:border-zinc-800 gap-1.5 flex-shrink-0">
        <button
          onClick={() => { setActiveTab('pdf'); setError(null); }}
          className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'pdf'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
          }`}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Upload PDF</span>
        </button>
        <button
          onClick={() => { setActiveTab('latex'); setError(null); }}
          className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'latex'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Paste LaTeX</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Error Message */}
        {error && (
          <div
            role="alert"
            className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-rose-600 dark:text-rose-400 text-xs"
          >
            {error}
          </div>
        )}

        {/* Form Inputs */}
        {activeTab === 'pdf' ? (
          <div className="flex flex-col gap-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Select or drop a PDF document to import"
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                isDragActive
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-800'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf,.pdf"
                className="hidden"
              />
              <UploadCloud
                className={`w-8 h-8 mx-auto mb-2 ${isDragActive ? 'text-indigo-500' : 'text-zinc-400'}`}
              />
              {isDragActive ? (
                <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  Drop the PDF to import it
                </div>
              ) : pdfFile ? (
                <div className="text-xs font-bold text-zinc-950 dark:text-zinc-50 truncate">
                  {pdfFile.name}
                  <span className="ml-1 font-normal text-zinc-500">
                    ({formatFileSize(pdfFile.size)})
                  </span>
                </div>
              ) : (
                <div className="text-xs text-zinc-500">
                  Select or drag a PDF math document here (Max 15MB)
                </div>
              )}
            </div>

            <button
              onClick={handleConvertPdf}
              disabled={converting || !pdfFile}
              className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
            >
              {converting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{converting ? 'Converting PDF…' : 'Convert PDF'}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 h-full min-h-[220px]">
            <textarea
              value={latexInput}
              onChange={(e) => setLatexInput(e.target.value)}
              aria-label="LaTeX or Markdown source"
              placeholder="# Vector Math&#10;Let u and v be vectors in R^3:&#10;u = \langle 1, 2, 3 \rangle&#10;v = \langle 4, 5, 6 \rangle&#10;&#10;Their cross product is:&#10;\[ u \times v = \langle -3, 6, -3 \rangle \]"
              className="flex-1 min-h-[150px] p-3 text-xs border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 rounded-xl outline-none font-mono focus:border-indigo-500 transition-colors"
            />

            <button
              onClick={handleConvertText}
              disabled={converting || !latexInput.trim()}
              className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
            >
              {converting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{converting ? 'Converting Text…' : 'Convert Text'}</span>
            </button>
          </div>
        )}

        {/* Conversion Results preview */}
        {convertedXml && diff && (
          <div className="flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <FileCode className="w-4 h-4 text-indigo-500" />
                <span>Conversion Result</span>
              </h3>
              <div className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
                <button
                  onClick={() => setPreviewMode('diff')}
                  aria-pressed={previewMode === 'diff'}
                  title="Show as a changeset"
                  className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors ${
                    previewMode === 'diff'
                      ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400'
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  <GitCompare className="w-3 h-3" />
                  <span>Diff</span>
                </button>
                <button
                  onClick={() => setPreviewMode('raw')}
                  aria-pressed={previewMode === 'raw'}
                  title="Show raw XML"
                  className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors ${
                    previewMode === 'raw'
                      ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400'
                      : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  <Code2 className="w-3 h-3" />
                  <span>Raw</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {formatDiffSummary(diff.summary)}
              </span>
              <span>
                {conversionSource
                  ? '· compared against your pasted source'
                  : '· new content, nothing replaced'}
              </span>
            </div>

            {diff.truncated && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400">
                Document is large — showing a whole-block comparison rather than a
                line-by-line one.
              </div>
            )}

            {previewMode === 'diff' ? (
              <div className="max-h-[320px] overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-900 dark:bg-zinc-950 py-2 font-mono text-[11px]">
                {diff.rows.map(renderDiffRow)}
              </div>
            ) : (
              <textarea
                readOnly
                value={convertedXml}
                aria-label="Converted PreTeXt XML"
                className="w-full min-h-[160px] p-3 text-xs bg-zinc-900 dark:bg-zinc-950 text-emerald-400 dark:text-emerald-500 rounded-xl outline-none font-mono border border-zinc-200 dark:border-zinc-800"
              />
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={handleInsertAtCursor}
                disabled={!activeTabOpen}
                className={`w-full h-9 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
                  insertSuccess
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
                title={activeTabOpen ? 'Insert XML into active editor cursor position' : 'Open a file in editor to insert'}
              >
                {insertSuccess ? <Check className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
                <span>{insertSuccess ? 'Inserted!' : 'Insert at Cursor'}</span>
              </button>

              <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-1" />

              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="src/new-chapter.xml"
                  aria-label="New file path"
                  className="w-full p-2 text-xs border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 rounded-lg outline-none font-mono focus:border-indigo-500"
                />

                <button
                  onClick={handleCreateNewFile}
                  disabled={creatingFile || !newFileName.trim()}
                  className="w-full h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                >
                  {creatingFile ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                  <span>{creatingFile ? 'Creating File…' : 'Create New File'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorImportPane;
