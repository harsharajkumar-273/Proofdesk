import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  RefreshCw,
  Check,
  AlertTriangle,
  FileCode,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface EditorImportPaneProps {
  sessionId: string | null;
  apiUrl: string;
  onInsertAtCursor: (text: string) => void;
  onCreateNewFile: (fileName: string, content: string) => Promise<void>;
  activeTabOpen: boolean;
}

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
  const [mathPixConfigured, setMathPixConfigured] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [insertSuccess, setInsertSuccess] = useState(false);
  const [newFileName, setNewFileName] = useState('src/imported-pretext.xml');
  const [creatingFile, setCreatingFile] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fetch import configuration status
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${apiUrl}/import/config`, {
          headers: {
            'Authorization': `Bearer local-test`, // fallback token / session auth
          },
        });
        if (res.ok) {
          const data = (await res.json()) as { mathPixConfigured: boolean };
          setMathPixConfigured(data.mathPixConfigured);
        }
      } catch (err) {
        console.warn('Failed to fetch import config:', err);
      }
    };
    void fetchConfig();
  }, [apiUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setPdfFile(e.target.files[0]);
      setError(null);
    }
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: latexInput }),
      });
      
      if (!res.ok) {
        throw new Error('Failed to convert text content');
      }
      
      const data = (await res.json()) as { success: boolean; pretext: string };
      setConvertedXml(data.pretext);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Text conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const handleConvertPdf = async () => {
    if (!pdfFile) {
      setError('Please select a PDF file first.');
      return;
    }
    setConverting(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('file', pdfFile);

    try {
      const res = await fetch(`${apiUrl}/import/pdf`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = (await res.json()) as { error?: string; details?: string };
        throw new Error(errData.details || errData.error || 'Failed to convert PDF file');
      }

      const data = (await res.json()) as { success: boolean; pretext: string };
      setConvertedXml(data.pretext);
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
    setTimeout(() => setInsertSuccess(false), 2000);
  };

  const handleCreateNewFile = async () => {
    if (!convertedXml || !newFileName.trim()) return;
    setCreatingFile(true);
    setError(null);
    try {
      await onCreateNewFile(newFileName.trim(), convertedXml);
      setConvertedXml('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to create file');
    } finally {
      setCreatingFile(false);
    }
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
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-rose-600 dark:text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Form Inputs */}
        {activeTab === 'pdf' ? (
          <div className="flex flex-col gap-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-800 rounded-xl p-6 text-center cursor-pointer transition-colors"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="application/pdf"
                className="hidden"
              />
              <UploadCloud className="w-8 h-8 mx-auto mb-2 text-zinc-400" />
              {pdfFile ? (
                <div className="text-xs font-bold text-zinc-950 dark:text-zinc-50 truncate">
                  {pdfFile.name}
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
              placeholder="# Vector Math&#10;Let u and v be vectors in R^3:&#10;u = \langle 1, 2, 3 \rangle&#10;v = \langle 4, 5, 6 \rangle&#10;&#10;Their cross product is:&#10;\[ u \times v = \langle -3, 6, -3 \rangle \]"
              className="flex-1 min-h-[150px] p-3 text-xs border border-zinc-200 dark:border-zinc-850 bg-zinc-50 dark:bg-zinc-950 rounded-xl outline-none font-mono focus:border-indigo-500 transition-colors"
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
        {convertedXml && (
          <div className="flex flex-col gap-3 border-t border-zinc-200 dark:border-zinc-800 pt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-indigo-500" />
              <span>Conversion Result</span>
            </h3>

            <textarea
              readOnly
              value={convertedXml}
              className="w-full min-h-[160px] p-3 text-xs bg-zinc-900 dark:bg-zinc-950 text-emerald-400 dark:text-emerald-500 rounded-xl outline-none font-mono border border-zinc-850"
            />

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
                  className="w-full p-2 text-xs border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 rounded-lg outline-none font-mono focus:border-indigo-500"
                />
                
                <button
                  onClick={handleCreateNewFile}
                  disabled={creatingFile || !newFileName.trim()}
                  className="w-full h-9 rounded-xl bg-indigo-600 hover:bg-indigo-505 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40"
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
