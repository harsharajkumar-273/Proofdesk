import { describe, it, expect, vi } from 'vitest';
import {
  captureAllCursorStates,
  reconcileOffset,
  restoreAllCursorStates,
} from './cursorReconciliation';

describe('Cursor State Reconciliation (#9)', () => {
  it('reconciles character offset accurately when text is added before cursor', () => {
    // Cursor at index 20, 5 characters added at index 5
    const originalOffset = 20;
    const deltas = [{ offset: 5, lengthRemoved: 0, lengthAdded: 5 }];

    const reconciled = reconcileOffset(originalOffset, deltas);
    expect(reconciled).toBe(25);
  });

  it('reconciles character offset accurately when text is removed before cursor', () => {
    // Cursor at index 20, 4 characters removed at index 5
    const originalOffset = 20;
    const deltas = [{ offset: 5, lengthRemoved: 4, lengthAdded: 0 }];

    const reconciled = reconcileOffset(originalOffset, deltas);
    expect(reconciled).toBe(16);
  });

  it('leaves offset unchanged when edits occur after cursor offset', () => {
    // Cursor at index 10, edit occurs at index 30
    const originalOffset = 10;
    const deltas = [{ offset: 30, lengthRemoved: 5, lengthAdded: 10 }];

    const reconciled = reconcileOffset(originalOffset, deltas);
    expect(reconciled).toBe(10);
  });

  it('captures cursor selections from editor and converts to character offsets', () => {
    const mockSelection = {
      getStartPosition: () => ({ lineNumber: 1, column: 5 }),
      getEndPosition: () => ({ lineNumber: 1, column: 10 }),
      selectionStartLineNumber: 1,
      selectionStartColumn: 5,
      positionLineNumber: 1,
      positionColumn: 10,
      getDirection: () => 0, // LTR
    };

    const mockEditor = {
      getSelections: vi.fn().mockReturnValue([mockSelection]),
    } as any;

    const mockModel = {
      getOffsetAt: vi.fn((pos) => (pos.column === 5 ? 4 : 9)),
    } as any;

    const captured = captureAllCursorStates(mockEditor, mockModel);
    expect(captured).toHaveLength(1);
    expect(captured[0].startOffset).toBe(4);
    expect(captured[0].endOffset).toBe(9);
    expect(captured[0].isReversed).toBe(false);
  });

  it('restores reconciled selections to Monaco editor', () => {
    const mockEditor = {
      setSelections: vi.fn(),
    } as any;

    const mockModel = {
      getValueLength: vi.fn().mockReturnValue(100),
      getPositionAt: vi.fn((offset) => ({ lineNumber: 1, column: offset + 1 })),
    } as any;

    const savedStates = [
      {
        selection: {
          selectionStartLineNumber: 1,
          selectionStartColumn: 5,
          positionLineNumber: 1,
          positionColumn: 10,
        },
        startOffset: 4,
        endOffset: 9,
        isReversed: false,
      },
    ];

    const deltas = [{ offset: 0, lengthRemoved: 0, lengthAdded: 2 }];

    restoreAllCursorStates(mockEditor, mockModel, savedStates, deltas);

    expect(mockEditor.setSelections).toHaveBeenCalledWith([
      {
        selectionStartLineNumber: 1,
        selectionStartColumn: 7, // 4 + 2 + 1
        positionLineNumber: 1,
        positionColumn: 12, // 9 + 2 + 1
      },
    ]);
  });
});
