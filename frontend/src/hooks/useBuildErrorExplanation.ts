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
export type ExplanationFeedback = 'none' | 'helpful' | 'not_helpful';

const GENERIC_ERROR = 'Could not get an explanation right now. Please try again.';

const messageFor = (error: unknown): string => {
  if (error instanceof EditorApiError) {
    if (error.status === 429) return 'Too many explanation requests. Please wait a few minutes and try again.';
    if (error.code === 'build_log_not_found') return 'The output of this build is no longer available. Run the build again.';
    if (error.code === 'build_not_failed') return 'The latest build did not fail, so there is nothing to explain.';
    if (error.code === 'build_in_progress') return 'The build is still running. Try again when it finishes.';
    return error.message || GENERIC_ERROR;
  }
  return GENERIC_ERROR;
};

/**
 * Asks the server to explain the session's last failed build in plain English.
 * The server reads the build log itself, so nothing but the session id is sent.
 * `unavailable` becomes true when the server has no AI key configured, so the
 * UI can hide the feature instead of offering a button that cannot work.
 */
export function useBuildErrorExplanation(apiUrl: string, sessionId: string) {
  const [status, setStatus] = useState<ExplanationStatus>('idle');
  const [explanation, setExplanation] = useState<BuildErrorExplanation | null>(null);
  const [explanationId, setExplanationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [unavailable, setUnavailable] = useState(false);
  const [feedback, setFeedback] = useState<ExplanationFeedback>('none');

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  // Bumped by reset(); an answer for an earlier generation is dropped.
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const endpoint = `${apiUrl}/build/explain-error/${encodeURIComponent(sessionId)}`;

  const explain = useCallback(async () => {
    if (inFlightRef.current || !sessionId) return;
    inFlightRef.current = true;
    const generation = generationRef.current;
    setStatus('loading');
    setErrorMessage('');

    try {
      const data = await requestJson<{ explanation: BuildErrorExplanation; id?: string }>(
        endpoint,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
        GENERIC_ERROR,
      );
      if (!mountedRef.current || generation !== generationRef.current) return;
      setExplanation(data.explanation);
      setExplanationId(data.id ?? null);
      setFeedback('none');
      setStatus('success');
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
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
  }, [endpoint, sessionId]);

  /** Forgets the current explanation, e.g. because a newer build replaced the one it explained. */
  const reset = useCallback(() => {
    generationRef.current += 1;
    inFlightRef.current = false;
    setStatus('idle');
    setExplanation(null);
    setExplanationId(null);
    setErrorMessage('');
    setFeedback('none');
  }, []);

  /** Records whether the explanation helped. Best effort: a failure is not shown to the author. */
  const sendFeedback = useCallback(
    async (helpful: boolean) => {
      if (!explanationId || feedback !== 'none') return;
      setFeedback(helpful ? 'helpful' : 'not_helpful');
      try {
        await requestJson(
          `${endpoint}/feedback`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: explanationId, helpful }),
          },
          'Could not send feedback',
        );
      } catch {
        // Feedback is optional; keep the author's vote shown either way.
      }
    },
    [endpoint, explanationId, feedback],
  );

  return {
    status,
    explanation,
    errorMessage,
    unavailable,
    feedback,
    canSendFeedback: Boolean(explanationId),
    explain,
    sendFeedback,
    reset,
  };
}

export type BuildErrorExplainer = ReturnType<typeof useBuildErrorExplanation>;
