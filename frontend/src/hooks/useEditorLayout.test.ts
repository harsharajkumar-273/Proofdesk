import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import {
  clampEditorWidthPercent,
  clampSidebarWidth,
  useEditorLayout,
} from './useEditorLayout';

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
};

const mouseDown = (clientX: number) =>
  ({ clientX, preventDefault: () => undefined }) as unknown as React.MouseEvent;

const moveMouse = (clientX: number) => document.dispatchEvent(new MouseEvent('mousemove', { clientX }));
const releaseMouse = () => document.dispatchEvent(new MouseEvent('mouseup'));

describe('clamping helpers', () => {
  it('keeps the sidebar between 200px and 500px', () => {
    expect(clampSidebarWidth(280, 40)).toBe(320);
    expect(clampSidebarWidth(280, -500)).toBe(200);
    expect(clampSidebarWidth(280, 500)).toBe(500);
  });

  it('keeps the editor split between 30% and 70%', () => {
    expect(clampEditorWidthPercent(60, 100, 1000)).toBe(70);
    expect(clampEditorWidthPercent(60, -900, 1000)).toBe(30);
    expect(clampEditorWidthPercent(50, 50, 1000)).toBeCloseTo(55);
  });
});

describe('useEditorLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewportWidth(1280);
  });
  afterEach(() => releaseMouse());

  it('opens the sidebar on desktop and closes it on compact viewports', () => {
    const desktop = renderHook(() => useEditorLayout());
    expect(desktop.result.current.isCompactViewport).toBe(false);
    expect(desktop.result.current.sidebarOpen).toBe(true);

    setViewportWidth(500);
    const compact = renderHook(() => useEditorLayout());
    expect(compact.result.current.isCompactViewport).toBe(true);
    expect(compact.result.current.sidebarOpen).toBe(false);
  });

  it('collapses the sidebar when the window shrinks to compact', () => {
    const { result } = renderHook(() => useEditorLayout());
    act(() => {
      setViewportWidth(500);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.isCompactViewport).toBe(true);
    expect(result.current.sidebarOpen).toBe(false);
  });

  it('toggles and persists the split view preference', () => {
    const { result } = renderHook(() => useEditorLayout());
    expect(result.current.splitView).toBe(true);
    act(() => result.current.toggleSplitView());
    expect(result.current.splitView).toBe(false);
    expect(localStorage.getItem('proofdesk_split_view')).toBe('false');
    expect(renderHook(() => useEditorLayout()).result.current.splitView).toBe(false);
  });

  it('resizes the sidebar by dragging and stops on mouseup', () => {
    const { result } = renderHook(() => useEditorLayout());
    act(() => result.current.handleSidebarResizeStart(mouseDown(100)));
    act(() => moveMouse(160));
    expect(result.current.sidebarWidth).toBe(340);
    act(() => releaseMouse());
    act(() => moveMouse(400));
    expect(result.current.sidebarWidth).toBe(340);
  });

  it('resizes the editor/preview split relative to the available width', () => {
    const { result } = renderHook(() => useEditorLayout());
    // container = 1280 - (280 + 12) = 988px; a 98.8px drag is +10%
    act(() => result.current.handleEditorResizeStart(mouseDown(500)));
    act(() => moveMouse(598.8));
    expect(result.current.editorWidth).toBeCloseTo(70, 1);
  });
});
