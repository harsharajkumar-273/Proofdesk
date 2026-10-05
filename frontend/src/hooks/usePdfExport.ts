import { useCallback, useEffect, useRef, useState } from 'react';

const PDF_POLL_INTERVAL_MS = 5000;

interface UsePdfExportOptions {
  /** Returns the current build session id, or null if there is no build yet. */
  getSessionId: () => string | null;
  /** Authenticated API call, relative to the backend root. */
  request: <T>(pathname: string, init?: RequestInit) => Promise<T>;
  apiUrl: string;
  /** File name offered to the browser when the PDF downloads. */
  filename: string;
}

const triggerDownload = (href: string, filename: string) => {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

/**
 * Starts a server-side PDF build for the current build session, polls until it
 * is ready, then downloads it. Polling stops when the component unmounts.
 */
export function usePdfExport({ getSessionId, request, apiUrl, filename }: UsePdfExportOptions) {
  const [pdfBuilding, setPdfBuilding] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const latest = useRef({ getSessionId, request, apiUrl, filename });
  latest.current = { getSessionId, request, apiUrl, filename };

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const exportPdf = useCallback(async () => {
    const sessionId = latest.current.getSessionId();
    if (!sessionId || busyRef.current) return;

    busyRef.current = true;
    setPdfBuilding(true);
    try {
      await latest.current.request(`/build/pdf/${sessionId}`, { method: 'POST' });
    } catch {
      busyRef.current = false;
      setPdfBuilding(false);
      return;
    }

    const finish = () => {
      stopPolling();
      busyRef.current = false;
      setPdfBuilding(false);
    };

    stopPolling();
    pollRef.current = setInterval(async () => {
      const { getSessionId: currentSessionId, request: send, apiUrl: base, filename: name } = latest.current;
      const sid = currentSessionId();
      if (!sid) {
        finish();
        return;
      }
      try {
        const { status } = await send<{ status: string }>(`/build/pdf-status/${sid}`);
        if (status === 'ready') {
          finish();
          triggerDownload(`${base}/build/pdf-download/${sid}`, name);
        } else if (status === 'idle') {
          // Build finished but no PDF was produced.
          finish();
        }
      } catch {
        finish();
      }
    }, PDF_POLL_INTERVAL_MS);
  }, [stopPolling]);

  return { pdfBuilding, exportPdf };
}
