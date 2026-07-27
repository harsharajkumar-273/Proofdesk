import type { editor } from 'monaco-editor';

export interface CursorState {
  selection: {
    selectionStartLineNumber: number;
    selectionStartColumn: number;
    positionLineNumber: number;
    positionColumn: number;
  };
  startOffset: number;
  endOffset: number;
  isReversed: boolean;
}

export interface TextEditDelta {
  offset: number;
  lengthRemoved: number;
  lengthAdded: number;
}

/**
 * Captures current cursor selection states from Monaco Editor as character offsets.
 */
export const captureAllCursorStates = (
  editor: editor.IStandaloneCodeEditor,
  model: editor.ITextModel
): CursorState[] => {
  const selections = editor.getSelections();
  if (!selections || selections.length === 0) return [];

  return selections.map((sel) => {
    const startPos = sel.getStartPosition();
    const endPos = sel.getEndPosition();
    return {
      selection: {
        selectionStartLineNumber: sel.selectionStartLineNumber,
        selectionStartColumn: sel.selectionStartColumn,
        positionLineNumber: sel.positionLineNumber,
        positionColumn: sel.positionColumn,
      },
      startOffset: model.getOffsetAt(startPos),
      endOffset: model.getOffsetAt(endPos),
      isReversed: sel.getDirection() === 1,
    };
  });
};

/**
 * Adjusts character offset based on text deltas inserted/removed before the offset.
 */
export const reconcileOffset = (offset: number, deltas: TextEditDelta[] = []): number => {
  let adjusted = offset;
  for (const delta of deltas) {
    if (delta.offset <= offset) {
      const removedBefore = Math.min(delta.lengthRemoved, offset - delta.offset);
      adjusted = adjusted - removedBefore + delta.lengthAdded;
    }
  }
  return Math.max(0, adjusted);
};

/**
 * Reconciles cursor state after document sync edits and restores selections in Monaco Editor.
 */
export const restoreAllCursorStates = (
  editor: editor.IStandaloneCodeEditor,
  model: editor.ITextModel,
  savedStates: CursorState[],
  deltas: TextEditDelta[] = []
): void => {
  if (!savedStates || savedStates.length === 0) return;

  const maxOffset = model.getValueLength();

  const newSelections = savedStates.map((saved) => {
    const newStartOffset = Math.min(maxOffset, reconcileOffset(saved.startOffset, deltas));
    const newEndOffset = Math.min(maxOffset, reconcileOffset(saved.endOffset, deltas));

    const startPos = model.getPositionAt(newStartOffset);
    const endPos = model.getPositionAt(newEndOffset);

    return saved.isReversed
      ? {
          selectionStartLineNumber: endPos.lineNumber,
          selectionStartColumn: endPos.column,
          positionLineNumber: startPos.lineNumber,
          positionColumn: startPos.column,
        }
      : {
          selectionStartLineNumber: startPos.lineNumber,
          selectionStartColumn: startPos.column,
          positionLineNumber: endPos.lineNumber,
          positionColumn: endPos.column,
        };
  });

  editor.setSelections(newSelections);
};
