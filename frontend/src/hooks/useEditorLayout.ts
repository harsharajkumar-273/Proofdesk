import { useCallback, useEffect, useRef, useState } from 'react';

const COMPACT_VIEWPORT_MAX_WIDTH = 768;
const SPLIT_VIEW_STORAGE_KEY = 'proofdesk_split_view';

export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 500;
export const EDITOR_MIN_PERCENT = 30;
export const EDITOR_MAX_PERCENT = 70;
/** Gap between the sidebar and the editor area, used when converting drags to a percentage. */
const SIDEBAR_GUTTER = 12;

export const isCompactEditorViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < COMPACT_VIEWPORT_MAX_WIDTH;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const clampSidebarWidth = (startWidth: number, deltaPx: number) =>
  clamp(startWidth + deltaPx, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);

export const clampEditorWidthPercent = (startPercent: number, deltaPx: number, containerWidthPx: number) =>
  clamp(startPercent + (deltaPx / containerWidthPx) * 100, EDITOR_MIN_PERCENT, EDITOR_MAX_PERCENT);

const readStoredSplitView = (): boolean => {
  try {
    const stored = localStorage.getItem(SPLIT_VIEW_STORAGE_KEY);
    return stored !== null ? stored === 'true' : true;
  } catch {
    return true;
  }
};

/**
 * Owns the editor shell's layout state: compact-viewport detection, sidebar
 * visibility/width, the editor/preview split, and the drag handles that resize them.
 */
export function useEditorLayout() {
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() => isCompactEditorViewport());
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => !isCompactEditorViewport());
  const [sidebarWidth, setSidebarWidth] = useState<number>(280);
  const [editorWidth, setEditorWidth] = useState<number>(60);
  const [splitView, setSplitView] = useState<boolean>(readStoredSplitView);

  const wasCompactViewportRef = useRef<boolean>(isCompactViewport);
  // Drag handlers are registered once per drag; refs let them see current layout values.
  const layoutRef = useRef({ sidebarOpen, sidebarWidth, editorWidth });
  layoutRef.current = { sidebarOpen, sidebarWidth, editorWidth };

  useEffect(() => {
    const handleViewportResize = () => {
      const nextIsCompact = isCompactEditorViewport();
      setIsCompactViewport(nextIsCompact);

      if (nextIsCompact && !wasCompactViewportRef.current) {
        setSidebarOpen(false);
      }

      wasCompactViewportRef.current = nextIsCompact;
    };

    handleViewportResize();
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  const toggleSplitView = useCallback(() => {
    setSplitView((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SPLIT_VIEW_STORAGE_KEY, String(next));
      } catch {
        // Persisting the preference is best-effort.
      }
      return next;
    });
  }, []);

  const startDrag = useCallback((startX: number, onMove: (deltaPx: number) => void) => {
    const handleMove = (event: MouseEvent) => onMove(event.clientX - startX);
    const handleStop = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleStop);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleStop);
  }, []);

  const handleSidebarResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startWidth = layoutRef.current.sidebarWidth;
      startDrag(event.clientX, (deltaPx) => setSidebarWidth(clampSidebarWidth(startWidth, deltaPx)));
    },
    [startDrag],
  );

  const handleEditorResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startPercent = layoutRef.current.editorWidth;
      startDrag(event.clientX, (deltaPx) => {
        const { sidebarOpen: open, sidebarWidth: width } = layoutRef.current;
        const containerWidth = window.innerWidth - (open ? width + SIDEBAR_GUTTER : 0);
        setEditorWidth(clampEditorWidthPercent(startPercent, deltaPx, containerWidth));
      });
    },
    [startDrag],
  );

  return {
    isCompactViewport,
    sidebarOpen,
    setSidebarOpen,
    sidebarWidth,
    editorWidth,
    setEditorWidth,
    splitView,
    toggleSplitView,
    handleSidebarResizeStart,
    handleEditorResizeStart,
  };
}
