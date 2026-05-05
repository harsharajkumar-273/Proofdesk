import React, { useCallback, useState } from 'react';
import type { editor } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Download,
  Eye,
  LayoutGrid,
  Link,
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
  liveEditStatus: string;
  liveEditMode: boolean;
  lastSavedAt: Date | null;
  collaborationEnabled: boolean;
  collaborators: CollaborationParticipant[];
  collaborationStatus: string;
  getParticipantName: (participant: CollaborationParticipant) => string;
  getParticipantInitials: (participant: CollaborationParticipant) => string;
  compileRepository: () => void;
  jumpToRelatedPreview: () => Promise<void>;
  setEditorWidth: (value: number) => void;
  isRebuilding: boolean;
  previewUrl: string | null;
  previewFrameKey: number;
  compiledOutput: string;
  sessionId?: string | null;
  apiUrl?: string;
  previewHistory: PreviewSnapshotEntry[];
  previewDiffEnabled: boolean;
  previewBaseSnapshotId: string | null;
  previewDiffSummary?: PreviewSnapshotEntry['changeSummary'] | null;
  onTogglePreviewDiff: () => void;
  onSelectPreviewBaseSnapshot: (snapshotId: string) => void;
}

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
  liveEditStatus,
  liveEditMode,
  lastSavedAt,
  collaborationEnabled,
  collaborators,
  collaborationStatus,
  getParticipantName,
  getParticipantInitials,
  compileRepository,
  jumpToRelatedPreview,
  setEditorWidth,
  isRebuilding,
  previewUrl,
  previewFrameKey,
  compiledOutput,
  sessionId,
  apiUrl = 'http://localhost:4000',
  previewHistory,
  previewDiffEnabled,
  previewBaseSnapshotId,
  previewDiffSummary,
  onTogglePreviewDiff,
  onSelectPreviewBaseSnapshot,
}) => {
  const [shareState, setShareState] = useState<'idle' | 'loading' | 'copied'>('idle');
  const [reviewLinkCopied, setReviewLinkCopied] = useState(false);

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

  const renderEditor = () => (
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
      }}
    />
  );

  const baseSnapshot = previewHistory.find((snapshot) => snapshot.snapshotId === previewBaseSnapshotId) || null;
  const baseSnapshotUrl = sessionId && baseSnapshot
    ? `${apiUrl}/build/preview-history/${encodeURIComponent(sessionId)}/${encodeURIComponent(baseSnapshot.snapshotId)}?entryFile=${encodeURIComponent(baseSnapshot.entryFile)}`
    : null;

  if (compilationMode === 'file') {
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
          <div className="editor-preview-toolbar flex h-8 flex-shrink-0 items-center justify-between border-b border-gray-700 bg-gray-800 px-3">
            <div className="flex items-center space-x-2">
              <Eye className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Preview</span>
              {srcDocContent && (
                <span className="flex items-center gap-1 rounded-full bg-green-900 px-2 py-0.5 text-xs text-green-300">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  Draft
                </span>
              )}
              {compiling && (
                <div className="flex items-center text-xs text-blue-400">
                  <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                  {srcDocContent ? 'Syncing compiled preview…' : 'Building...'}
                </div>
              )}
              {liveEditStatus && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  liveEditStatus.includes('updated') ? 'bg-green-900 text-green-300' :
                  liveEditStatus.includes('fail') || liveEditStatus.includes('error') ? 'bg-red-900 text-red-300' :
                  'bg-yellow-900 text-yellow-300'
                }`}>
                  {liveEditStatus}
                </span>
              )}
              {liveEditMode && lastSavedAt && !liveEditStatus && (
                <span className="text-xs text-gray-500">Updated {lastSavedAt.toLocaleTimeString()}</span>
              )}
              {collaborationEnabled && collaborators.length > 0 && (
                <div className="ml-1 flex items-center space-x-1">
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
                <span className="rounded-full bg-cyan-900 px-2 py-0.5 text-xs text-cyan-300">
                  {collaborationStatus}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => void jumpToRelatedPreview()}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
                title="Open the preview page that best matches the active source file"
              >
                <ArrowUpRight className="h-3 w-3" />
                <span className="hidden sm:inline">Related Page</span>
              </button>
              {previewHistory.length > 1 && previewUrl && (
                <button
                  onClick={onTogglePreviewDiff}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
                    previewDiffEnabled ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                  title="Compare the current preview with an earlier compiled snapshot"
                >
                  <SplitSquareHorizontal className="h-3 w-3" />
                  <span className="hidden sm:inline">Diff</span>
                </button>
              )}
              {sessionId && (previewUrl || compiledOutput) && (
                <>
                  <button
                    onClick={() => void handleCopyReviewLink()}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
                    title="Copy reviewer link — fullscreen read-only view, no login needed"
                  >
                    {reviewLinkCopied ? (
                      <><Check className="h-3 w-3 text-green-400" /><span className="hidden text-green-400 sm:inline">Copied!</span></>
                    ) : (
                      <><BookOpen className="h-3 w-3" /><span className="hidden sm:inline">Review link</span></>
                    )}
                  </button>
                  <button
                    onClick={() => void handleSharePreview()}
                    disabled={shareState === 'loading'}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50"
                    title="Copy shareable link (valid 7 days, no login needed)"
                  >
                    {shareState === 'copied' ? (
                      <><Check className="h-3 w-3 text-green-400" /><span className="hidden text-green-400 sm:inline">Copied!</span></>
                    ) : (
                      <><Link className="h-3 w-3" /><span className="hidden sm:inline">Share</span></>
                    )}
                  </button>
                  <button
                    onClick={handleDownloadZip}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white"
                    title="Download compiled output as ZIP"
                  >
                    <Download className="h-3 w-3" />
                    <span className="hidden sm:inline">Export ZIP</span>
                  </button>
                </>
              )}
              <button
                onClick={compileRepository}
                className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
                title="Rebuild"
              >
                <RefreshCw className={`h-4 w-4 ${compiling ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setEditorWidth(50)}
                className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
                title="Reset split"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
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
            {isRebuilding && !srcDocContent && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black bg-opacity-40">
                <div className="flex items-center space-x-2 rounded-lg bg-gray-800 px-4 py-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
                  <span className="text-sm text-purple-300">Rebuilding preview…</span>
                </div>
              </div>
            )}
            {srcDocContent ? (
              <iframe
                srcDoc={srcDocContent}
                key={`srcdoc-${previewFrameKey}`}
                className="h-full w-full"
                style={{ border: 'none', background: 'white' }}
                title="Live Preview"
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
