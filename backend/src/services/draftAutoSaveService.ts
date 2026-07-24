/**
 * Background Draft Auto-Save Worker Service
 * Periodically creates draft commits for active workspace sessions.
 */
import buildExecutor from './buildExecutor.js';
import { createWorkspaceDraftCommit } from './gitWorkspaceService.js';

let intervalId: NodeJS.Timeout | null = null;

export const startDraftAutoSaveWorker = (intervalMs: number = 60000) => {
  if (intervalId) return;

  intervalId = setInterval(async () => {
    for (const [sessionId] of buildExecutor.sessions.entries()) {
      try {
        await createWorkspaceDraftCommit(sessionId);
      } catch (err) {
        // Silent catch for background worker errors
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[DraftAutoSaveWorker] Auto-save skipped for session ${sessionId}: ${msg}`);
      }
    }
  }, intervalMs);
};

export const stopDraftAutoSaveWorker = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
};
