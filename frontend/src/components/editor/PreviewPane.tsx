import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { editor } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Download,
  Eye,
  FileText,
  LayoutGrid,
  Link,
  MoreHorizontal,
  Package,
  RefreshCw,
  SplitSquareHorizontal,
} from 'lucide-react';
import { formatPreviewSnapshotLabel, type PreviewSnapshotEntry } from '../../utils/previewDiff';

interface CollaborationParticipant {
  clientId: string;
  color: string;
  isSelf?: boolean;
}

interface PreviewPaneProps {
  compilationMode: 'repository' | 'file';
  activeTab: { language?: string; content: string } | null;
  editorWidth: number;
  onEditorResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  onEditorDidMount: (editor: editor.IStandaloneCodeEditor, monaco: typeof Monaco) => void;
  onEditorChange: (value?: string) => void;
  MonacoEditor: React.ComponentType<Record<string, unknown>>;
  srcDocContent: string | null;
  compiling: boolean;
  collaborationEnabled: boolean;
  collaborators: CollaborationParticipant[];
  collaborationStatus: string;
  getParticipantName: (participant: CollaborationParticipant) => string;
  getParticipantInitials: (participant: CollaborationParticipant) => string;
  compileRepository: () => void;
  jumpToRelatedPreview: () => Promise<void>;
  setEditorWidth: (value: number) => void;
  previewUrl: string | null;
  previewFrameKey: number;
  compiledOutput: string;
  sessionId?: string | null;
  apiUrl?: string;
  previewHistory: PreviewSnapshotEntry[];
  previewDiffEnabled: boolean;
  previewBaseSnapshotId: string | null;
  onTogglePreviewDiff: () => void;
  onSelectPreviewBaseSnapshot: (snapshotId: string) => void;
  splitView: boolean;
  compilerRuntime?: 'docker' | 'wasm';
  onChangeCompilerRuntime?: (runtime: 'docker' | 'wasm') => void;
}

/** An icon-only toolbar button. The label doubles as tooltip and accessible name. */
const ToolbarButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  /** Marks a button that opens a menu. */
  haspopup?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, pressed, haspopup, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    aria-label={label}
    aria-pressed={haspopup ? undefined : pressed}
    aria-haspopup={haspopup ? 'menu' : undefined}
    aria-expanded={haspopup ? Boolean(pressed) : undefined}
    className={`rounded p-1.5 transition-colors disabled:opacity-50 ${
      pressed ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
    }`}
  >
    {children}
  </button>
);

/** One row of the toolbar's "More" menu: an icon and a readable label. */
const MenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ icon, label, onClick, disabled }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    disabled={disabled}
    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-gray-200 hover:bg-gray-700 disabled:opacity-50"
  >
    <span className="flex-shrink-0 text-gray-400" aria-hidden="true">{icon}</span>
    {label}
  </button>
);

const PreviewPane: React.FC<PreviewPaneProps> = ({
  compilationMode,
  activeTab,
  editorWidth,
  onEditorResizeStart,
  onEditorDidMount,
  onEditorChange,
  MonacoEditor,
  srcDocContent,
  compiling,
  collaborationEnabled,
  collaborators,
  collaborationStatus,
  getParticipantName,
  getParticipantInitials,
  compileRepository,
  jumpToRelatedPreview,
  setEditorWidth,
  previewUrl,
  previewFrameKey,
  compiledOutput,
  sessionId,
  apiUrl = 'http://localhost:4000',
  previewHistory,
  previewDiffEnabled,
  previewBaseSnapshotId,
  onTogglePreviewDiff,
  onSelectPreviewBaseSnapshot,
  splitView,
  compilerRuntime = 'wasm',
  onChangeCompilerRuntime,
}) => {
  const [shareState, setShareState] = useState<'idle' | 'loading' | 'copied'>('idle');
  const [reviewLinkCopied, setReviewLinkCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // The "More" menu closes on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const handleDownloadZip = useCallback(() => {
    if (!sessionId) return;
    const url = `${apiUrl}/build/export/${encodeURIComponent(sessionId)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `proofdesk-output-${sessionId.slice(0, 8)}.zip`;
    a.click();
  }, [sessionId, apiUrl]);

  const handleCopyReviewLink = useCallback(async () => {
    if (!sessionId) return;
    const url = `${window.location.origin}/review/${sessionId}`;
    await navigator.clipboard.writeText(url).catch(() => window.prompt('Copy review link', url));
    setReviewLinkCopied(true);
    setTimeout(() => setReviewLinkCopied(false), 2500);
  }, [sessionId]);

  const handleSharePreview = useCallback(async () => {
    if (!sessionId || shareState === 'loading') return;
    setShareState('loading');
    try {
      const res = await fetch(`${apiUrl}/build/share/${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryFile: previewUrl?.split('/').pop() ?? 'overview.html' }),
      });
      if (!res.ok) throw new Error('Failed to create share link');
      const { url } = await res.json() as { url: string };
      await navigator.clipboard.writeText(url);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2500);
    } catch {
      setShareState('idle');
    }
  }, [sessionId, apiUrl, previewUrl, shareState]);

  // Monaco stays mounted even with no file open (its instance is wired into
  // collaboration and markers), so the empty state is laid over it.
  const renderEditor = () => (
    <div className="relative h-full">
      <MonacoEditor
        height="100%"
        language={activeTab?.language || 'plaintext'}
        value={activeTab?.content}
        onChange={onEditorChange}
        onMount={onEditorDidMount}
        theme="handshake-light"
        options={{
          minimap: { enabled: true },
          fontSize: 14,
          wordWrap: 'on',
          renderLineHighlight: 'gutter',
        }}
      />
      {!activeTab && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-white p-6 dark:bg-zinc-950"
          data-testid="editor-empty-state"
        >
          <div className="max-w-xs text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-zinc-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">No file open</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Choose a file from the explorer to start editing. The preview updates as you type.
              Press <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono text-[10px]">Ctrl/⌘ K</kbd> to find a file or command.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  const baseSnapshot = previewHistory.find((snapshot) => snapshot.snapshotId === previewBaseSnapshotId) || null;
  const baseSnapshotUrl = sessionId && baseSnapshot
    ? `${apiUrl}/build/preview-history/${encodeURIComponent(sessionId)}/${encodeURIComponent(baseSnapshot.snapshotId)}?entryFile=${encodeURIComponent(baseSnapshot.entryFile)}`
    : null;

  // Opening a file switches to "file" mode, but a draft preview (PreTeXt, XML
  // and HTML render in the browser as you type) is still worth showing beside
  // the editor. Other file types have no draft, so the editor takes the width.
  const showPreview = splitView && (compilationMode === 'repository' || Boolean(srcDocContent));

  if (!showPreview) {
    return (
      <div className="flex-1">
        <React.Suspense fallback={<div className="flex h-full items-center justify-center bg-gray-900 text-sm text-gray-400">Loading editor…</div>}>
          {renderEditor()}
        </React.Suspense>
      </div>
    );
  }

  return (
    <>
      <div className="editor-source-pane overflow-hidden" style={{ width: `${editorWidth}%` }}>
        <React.Suspense fallback={<div className="flex h-full items-center justify-center bg-gray-900 text-sm text-gray-400">Loading editor…</div>}>
          {renderEditor()}
        </React.Suspense>
      </div>

      <div
        className="editor-split-resizer w-1 flex-shrink-0 cursor-col-resize transition-colors hover:bg-blue-500 active:bg-blue-500"
        onMouseDown={onEditorResizeStart}
        style={{ cursor: 'col-resize' }}
      >
        <div className="flex h-full w-full items-center justify-center">
          <LayoutGrid className="h-3 w-3 rotate-90 text-gray-600" />
        </div>
      </div>

      <div className="editor-preview-surface overflow-hidden bg-gray-900" style={{ width: `${100 - editorWidth}%` }}>
        <div className="flex h-full flex-col">
          <div className="editor-preview-toolbar flex h-10 flex-shrink-0 items-center justify-between gap-2 border-b border-gray-700 bg-gray-800 px-3">
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
              <Eye className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
              <span className="text-sm font-medium text-gray-300">Preview</span>
              {srcDocContent && (
                <span className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-green-900 px-2 py-0.5 text-[10px] font-semibold text-green-300">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                  Draft
                </span>
              )}
              {compiling && (
                <div className="flex flex-shrink-0 items-center whitespace-nowrap text-xs text-blue-400" role="status">
                  <RefreshCw className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                  {srcDocContent ? 'Syncing…' : 'Building…'}
                </div>
              )}
              {collaborationEnabled && collaborators.length > 0 && (
                <div className="ml-1 flex flex-shrink-0 items-center space-x-1">
                  {collaborators.slice(0, 4).map((participant) => (
                    <div
                      key={participant.clientId}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-800 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: participant.color }}
                      title={`${getParticipantName(participant)}${participant.isSelf ? ' (You)' : ''}`}
                    >
                      {getParticipantInitials(participant)}
                    </div>
                  ))}
                </div>
              )}
              {collaborationEnabled && collaborationStatus && (
                <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-cyan-900 px-2 py-0.5 text-xs text-cyan-300">
                  {collaborationStatus}
                </span>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-0.5">
              <ToolbarButton
                label="Open the preview page for this file"
                onClick={() => void jumpToRelatedPreview()}
              >
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </ToolbarButton>
              <select
                value={compilerRuntime}
                onChange={(e) => onChangeCompilerRuntime?.(e.target.value as 'docker' | 'wasm')}
                aria-label="Preview engine"
                className="mx-1 max-w-[6.5rem] cursor-pointer rounded-md border border-gray-700 bg-gray-900 px-1.5 py-1 text-[11px] font-medium text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                title="WASM Sandbox renders in your browser; Cloud Docker builds on the server"
              >
                <option value="wasm" className="bg-gray-800 text-gray-200">In browser</option>
                <option value="docker" className="bg-gray-800 text-gray-200">On server</option>
              </select>
              <ToolbarButton label="Rebuild preview" onClick={compileRepository}>
                <RefreshCw className={`h-4 w-4 ${compiling ? 'animate-spin' : ''}`} aria-hidden="true" />
              </ToolbarButton>
              <div className="relative" ref={menuRef}>
                <ToolbarButton label="More preview actions" pressed={menuOpen} onClick={() => setMenuOpen((open) => !open)} haspopup>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </ToolbarButton>
                {menuOpen && (
                  <div
                    role="menu"
                    aria-label="Preview actions"
                    className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl"
                  >
                    {previewHistory.length > 1 && previewUrl && (
                      <MenuItem
                        icon={<SplitSquareHorizontal className="h-4 w-4" />}
                        label={previewDiffEnabled ? 'Stop comparing with an earlier build' : 'Compare with an earlier build'}
                        onClick={() => {
                          onTogglePreviewDiff();
                          setMenuOpen(false);
                        }}
                      />
                    )}
                    {sessionId && (previewUrl || compiledOutput) && (
                      <>
                        <MenuItem
                          icon={reviewLinkCopied ? <Check className="h-4 w-4 text-green-400" /> : <BookOpen className="h-4 w-4" />}
                          label={reviewLinkCopied ? 'Review link copied' : 'Copy review link (read-only, no login)'}
                          onClick={() => void handleCopyReviewLink()}
                        />
                        <MenuItem
                          icon={shareState === 'copied' ? <Check className="h-4 w-4 text-green-400" /> : <Link className="h-4 w-4" />}
                          label={shareState === 'copied' ? 'Share link copied' : 'Copy share link (valid 7 days)'}
                          disabled={shareState === 'loading'}
                          onClick={() => void handleSharePreview()}
                        />
                        <MenuItem
                          icon={<Download className="h-4 w-4" />}
                          label="Download the built site as a ZIP"
                          onClick={() => {
                            handleDownloadZip();
                            setMenuOpen(false);
                          }}
                        />
                      </>
                    )}
                    <MenuItem
                      icon={<LayoutGrid className="h-4 w-4" />}
                      label="Reset the split to 50/50"
                      onClick={() => {
                        setEditorWidth(50);
                        setMenuOpen(false);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {previewDiffEnabled && previewHistory.length > 1 && (
            <div className="border-b border-gray-700 bg-gray-900 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                <span className="font-medium text-gray-400">Compare current preview against</span>
                <select
                  value={previewBaseSnapshotId ?? ''}
                  onChange={(event) => onSelectPreviewBaseSnapshot(event.target.value)}
                  className="rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100"
                >
                  {previewHistory.slice(1).map((snapshot) => (
                    <option key={snapshot.snapshotId} value={snapshot.snapshotId}>
                      {formatPreviewSnapshotLabel(snapshot)}
                    </option>
                  ))}
                </select>
                {baseSnapshot?.excerpt && (
                  <span className="truncate text-gray-500" title={baseSnapshot.excerpt}>
                    {baseSnapshot.excerpt.slice(0, 80)}{baseSnapshot.excerpt.length > 80 ? '…' : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="relative flex-1 overflow-hidden">
            {srcDocContent ? (
              <iframe
                srcDoc={srcDocContent}
                key={`srcdoc-${previewFrameKey}`}
                className="h-full w-full"
                style={{ border: 'none', background: 'white' }}
                title="Build Preview"
                data-testid="preview-frame"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"
              />
            ) : previewDiffEnabled && previewUrl && baseSnapshotUrl ? (
              <div className="grid h-full grid-cols-1 divide-y divide-gray-700 md:grid-cols-2 md:divide-x md:divide-y-0">
                <div className="flex min-h-0 flex-col">
                  <div className="flex items-center justify-between border-b border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-300">
                    <span>Earlier compiled snapshot</span>
                    {baseSnapshot && <span className="text-gray-500">{formatPreviewSnapshotLabel(baseSnapshot)}</span>}
                  </div>
                  <iframe
                    src={baseSnapshotUrl}
                    className="h-full w-full"
                    style={{ border: 'none', background: 'white' }}
                    title="Previous Build Preview"
                  />
                </div>
                <div className="flex min-h-0 flex-col">
                  <div className="flex items-center justify-between border-b border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-300">
                    <span>Current compiled preview</span>
                    <span className="text-gray-500">Live</span>
                  </div>
                  <iframe
                    src={previewUrl}
                    key={`preview-diff-${previewFrameKey}-${previewUrl}`}
                    className="h-full w-full"
                    style={{ border: 'none' }}
                    title="Build Preview Diff Current"
                    data-testid="preview-frame"
                  />
                </div>
              </div>
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                key={`preview-${previewFrameKey}-${previewUrl}`}
                className="h-full w-full"
                style={{ border: 'none' }}
                title="Build Preview"
                data-testid="preview-frame"
              />
            ) : compiledOutput ? (
              <div className="h-full w-full overflow-auto" dangerouslySetInnerHTML={{ __html: compiledOutput }} />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500">
                <div className="text-center">
                  <Package className="mx-auto mb-3 h-12 w-12 opacity-50" />
                  <p className="text-sm">Open an HTML file or build the repository to see preview</p>
                  <button
                    onClick={compileRepository}
                    className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                  >
                    Build Repository
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default PreviewPane;
