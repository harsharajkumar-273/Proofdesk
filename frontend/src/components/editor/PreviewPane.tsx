import React from 'react';
import type { editor } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import {
  ArrowUpRight,
  Eye,
  LayoutGrid,
  Package,
  RefreshCw,
} from 'lucide-react';

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
}) => {
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
      <div
        className="overflow-hidden"
        style={{ width: `${editorWidth}%` }}
      >
        <React.Suspense fallback={<div className="flex h-full items-center justify-center bg-gray-900 text-sm text-gray-400">Loading editor…</div>}>
          {renderEditor()}
        </React.Suspense>
      </div>

      <div
        className="w-1 cursor-col-resize hover:bg-blue-500 active:bg-blue-500 transition-colors flex-shrink-0"
        onMouseDown={onEditorResizeStart}
        style={{ cursor: 'col-resize' }}
      >
        <div className="w-full h-full flex items-center justify-center">
          <LayoutGrid className="w-3 h-3 text-gray-600 rotate-90" />
        </div>
      </div>

      <div
        className="editor-preview-surface overflow-hidden bg-gray-900"
        style={{ width: `${100 - editorWidth}%` }}
      >
        <div className="h-full flex flex-col">
          <div className="editor-preview-toolbar h-8 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-3 flex-shrink-0">
            <div className="flex items-center space-x-2">
              <Eye className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Preview</span>
              {srcDocContent && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                  Draft
                </span>
              )}
              {compiling && (
                <div className="flex items-center text-xs text-blue-400">
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  {srcDocContent ? 'Syncing compiled preview…' : 'Building...'}
                </div>
              )}
              {liveEditStatus && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  liveEditStatus.includes('updated') ? 'bg-green-900 text-green-300' :
                  liveEditStatus.includes('fail') || liveEditStatus.includes('error') ? 'bg-red-900 text-red-300' :
                  'bg-yellow-900 text-yellow-300'
                }`}>
                  {liveEditStatus}
                </span>
              )}
              {liveEditMode && lastSavedAt && !liveEditStatus && (
                <span className="text-xs text-gray-500">
                  Updated {lastSavedAt.toLocaleTimeString()}
                </span>
              )}
              {collaborationEnabled && collaborators.length > 0 && (
                <div className="flex items-center space-x-1 ml-1">
                  {collaborators.slice(0, 4).map((participant) => (
                    <div
                      key={participant.clientId}
                      className="w-6 h-6 rounded-full text-[10px] font-semibold text-white flex items-center justify-center border border-gray-800"
                      style={{ backgroundColor: participant.color }}
                      title={`${getParticipantName(participant)}${participant.isSelf ? ' (You)' : ''}`}
                    >
                      {getParticipantInitials(participant)}
                    </div>
                  ))}
                </div>
              )}
              {collaborationEnabled && collaborationStatus && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-900 text-cyan-300">
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
                Related Page
              </button>
              <button
                onClick={compileRepository}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                title="Rebuild"
              >
                <RefreshCw className={`w-4 h-4 ${compiling ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setEditorWidth(50)}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                title="Reset split"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
            {isRebuilding && !srcDocContent && (
              <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center z-10 pointer-events-none">
                <div className="bg-gray-800 rounded-lg px-4 py-2 flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
                  <span className="text-sm text-purple-300">Rebuilding preview…</span>
                </div>
              </div>
            )}
            {srcDocContent ? (
              <iframe
                srcDoc={srcDocContent}
                key={`srcdoc-${previewFrameKey}`}
                className="w-full h-full"
                style={{ border: 'none', background: 'white' }}
                title="Live Preview"
                data-testid="preview-frame"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"
              />
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                key={`preview-${previewFrameKey}-${previewUrl}`}
                className="w-full h-full"
                style={{ border: 'none' }}
                title="Build Preview"
                data-testid="preview-frame"
              />
            ) : compiledOutput ? (
              <div
                className="h-full w-full overflow-auto"
                dangerouslySetInnerHTML={{ __html: compiledOutput }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Open an HTML file or build the repository to see preview</p>
                  <button
                    onClick={compileRepository}
                    className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
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
