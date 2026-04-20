import { useState, useCallback, useRef } from 'react';
import type { RefObject } from 'react';

interface SyncPosition {
  line: number;
  column: number;
  element?: string;
}

interface EditorSyncApi {
  setPosition: (position: { lineNumber: number; column: number }) => void;
  revealLineInCenter: (lineNumber: number) => void;
  deltaDecorations: (oldDecorations: string[], newDecorations: unknown[]) => string[];
}

export const useBidirectionalSync = (
  editorRef: RefObject<EditorSyncApi | null>,
  previewRef: RefObject<ParentNode | null>
) => {
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [lastSyncPosition] = useState<SyncPosition | null>(null);

  // Map source line to preview element
  const sourceToPreviewMap = useRef<Map<number, string>>(new Map());

  // Editor → Preview sync
  const syncEditorToPreview = useCallback((position: SyncPosition) => {
    if (!syncEnabled || !previewRef.current) return;

    const previewElement = sourceToPreviewMap.current.get(position.line);
    if (previewElement) {
      const element = previewRef.current.querySelector(`[data-source-line="${position.line}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight');
        setTimeout(() => element.classList.remove('highlight'), 2000);
      }
    }
  }, [previewRef, syncEnabled]);

  // Preview → Editor sync
  const syncPreviewToEditor = useCallback((elementId: string) => {
    if (!syncEnabled || !editorRef.current) return;
    const editor = editorRef.current;

    // Find source line for the clicked element
    let sourceLine = 0;
    sourceToPreviewMap.current.forEach((value, key) => {
      if (value === elementId) {
        sourceLine = key;
      }
    });

    if (sourceLine > 0) {
      editor.setPosition({ lineNumber: sourceLine, column: 1 });
      editor.revealLineInCenter(sourceLine);
      
      // Highlight the line
      const decoration = editor.deltaDecorations([], [
        {
          range: {
            startLineNumber: sourceLine,
            startColumn: 1,
            endLineNumber: sourceLine,
            endColumn: 1000
          },
          options: {
            isWholeLine: true,
            className: 'line-highlight'
          }
        }
      ]);

      setTimeout(() => {
        editor.deltaDecorations(decoration, []);
      }, 2000);
    }
  }, [editorRef, syncEnabled]);

  // Build source map when content changes
  const buildSourceMap = useCallback((content: string) => {
    sourceToPreviewMap.current.clear();
    
    const lines = content.split('\n');
    let elementCounter = 0;

    lines.forEach((line, index) => {
      // Simple heuristic: map headers, equations, etc.
      if (line.startsWith('#') || line.includes('$$') || line.includes('\\begin')) {
        sourceToPreviewMap.current.set(index + 1, `element-${elementCounter++}`);
      }
    });
  }, []);

  return {
    syncEnabled,
    setSyncEnabled,
    syncEditorToPreview,
    syncPreviewToEditor,
    buildSourceMap,
    lastSyncPosition
  };
};
