import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorApiError, requestJson } from '../utils/editorApi';

export interface BuildErrorExplanation {
  summary: string;
  likelyCause: string;
  fixSteps: string[];
  /** `path/to/file.xml:42`, or an empty string when the log names no location. */
  location: string;
  confidence: 'high' | 'medium' | 'low';
}

export type ExplanationStatus = 'idle' | 'loading' | 'success' | 'error';

const GENERIC_ERROR = 'Could not get an explanation right now. Please try again.';

const messageFor = (error: unknown): string => {
  if (error instanceof EditorApiError) {
    if (error.status === 429) return 'Too many explanation requests. Please wait a few minutes and try again.';
    if (error.status === 413) return 'This build log is too large to explain.';
    return error.message || GENERIC_ERROR;
  }
  return GENERIC_ERROR;
};

/**
 * Asks the server to explain a failed build log in plain English.
 * `unavailable` becomes true when the server has no AI key configured, so the
 * UI can hide the feature instead of offering a button that cannot work.
 */
export function useBuildErrorExplanation(apiUrl: string) {
  const [status, setStatus] = useState<ExplanationStatus>('idle');
  const [explanation, setExplanation] = useState<BuildErrorExplanation | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [unavailable, setUnavailable] = useState(false);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const explain = useCallback(
    async (log: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setStatus('loading');
      setErrorMessage('');

      try {
        const data = await requestJson<{ explanation: BuildErrorExplanation }>(
          `${apiUrl}/build/explain-error`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ log }),
          },
          GENERIC_ERROR,
        );
        if (!mountedRef.current) return;
        setExplanation(data.explanation);
        setStatus('success');
      } catch (error) {
        if (!mountedRef.current) return;
        if (error instanceof EditorApiError && error.code === 'ai_not_configured') {
          setUnavailable(true);
          setStatus('idle');
          return;
        }
        setErrorMessage(messageFor(error));
        setStatus('error');
      } finally {
        inFlightRef.current = false;
      }
    },
    [apiUrl],
  );

  return { status, explanation, errorMessage, unavailable, explain };
}
