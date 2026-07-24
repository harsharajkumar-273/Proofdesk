import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBidirectionalSync } from './useBidirectionalSync';

describe('useBidirectionalSync hook', () => {
  let mockEditor: {
    setPosition: ReturnType<typeof vi.fn>;
    revealLineInCenter: ReturnType<typeof vi.fn>;
    deltaDecorations: ReturnType<typeof vi.fn>;
  };

  let mockPreviewContainer: {
    querySelector: ReturnType<typeof vi.fn>;
  };

  let mockPreviewElement: {
    scrollIntoView: ReturnType<typeof vi.fn>;
    classList: {
      add: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockEditor = {
      setPosition: vi.fn(),
      revealLineInCenter: vi.fn(),
      deltaDecorations: vi.fn().mockReturnValue(['dec-1']),
    };

    mockPreviewElement = {
      scrollIntoView: vi.fn(),
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
    };

    mockPreviewContainer = {
      querySelector: vi.fn().mockReturnValue(mockPreviewElement),
    };
  });

  it('initializes with syncEnabled = true and allows toggling', () => {
    const editorRef = { current: mockEditor as any };
    const previewRef = { current: mockPreviewContainer as any };

    const { result } = renderHook(() => useBidirectionalSync(editorRef, previewRef));

    expect(result.current.syncEnabled).toBe(true);

    act(() => {
      result.current.setSyncEnabled(false);
    });

    expect(result.current.syncEnabled).toBe(false);
  });

  it('builds source map and syncs editor position to preview element', () => {
    const editorRef = { current: mockEditor as any };
    const previewRef = { current: mockPreviewContainer as any };

    const { result } = renderHook(() => useBidirectionalSync(editorRef, previewRef));

    const content = 'First line\n# Header Section\nNormal paragraph\n$$\\int x dx$$';

    act(() => {
      result.current.buildSourceMap(content);
    });

    act(() => {
      result.current.syncEditorToPreview({ line: 2, column: 1 });
    });

    expect(mockPreviewContainer.querySelector).toHaveBeenCalledWith('[data-source-line="2"]');
    expect(mockPreviewElement.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(mockPreviewElement.classList.add).toHaveBeenCalledWith('highlight');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockPreviewElement.classList.remove).toHaveBeenCalledWith('highlight');
  });

  it('syncs preview element selection to editor position and line decoration', () => {
    const editorRef = { current: mockEditor as any };
    const previewRef = { current: mockPreviewContainer as any };

    const { result } = renderHook(() => useBidirectionalSync(editorRef, previewRef));

    act(() => {
      result.current.buildSourceMap('# Header Section\nText line');
    });

    act(() => {
      result.current.syncPreviewToEditor('element-0');
    });

    expect(mockEditor.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 });
    expect(mockEditor.revealLineInCenter).toHaveBeenCalledWith(1);
    expect(mockEditor.deltaDecorations).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockEditor.deltaDecorations).toHaveBeenCalledWith(['dec-1'], []);
  });

  it('does nothing during sync when syncEnabled is false', () => {
    const editorRef = { current: mockEditor as any };
    const previewRef = { current: mockPreviewContainer as any };

    const { result } = renderHook(() => useBidirectionalSync(editorRef, previewRef));

    act(() => {
      result.current.setSyncEnabled(false);
      result.current.buildSourceMap('# Header Section');
    });

    act(() => {
      result.current.syncEditorToPreview({ line: 1, column: 1 });
      result.current.syncPreviewToEditor('element-0');
    });

    expect(mockPreviewContainer.querySelector).not.toHaveBeenCalled();
    expect(mockEditor.setPosition).not.toHaveBeenCalled();
  });
});
