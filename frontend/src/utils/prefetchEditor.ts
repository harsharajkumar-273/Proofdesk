/**
 * The editor is a large, separately loaded chunk (Monaco alone is ~2.5 MB, 660 KB
 * compressed). Pages the user is about to leave for the editor call
 * `prefetchEditor()` so it is already in the browser cache when they arrive.
 * `App` builds its lazy route from `loadEditorPage`, so a prefetch and the real
 * navigation share one import.
 */
export const loadEditorPage = () => import('../components/EditorPage');

type NetworkInformation = { saveData?: boolean };

/** True when the visitor has asked the browser to save data, where a speculative 600 KB download is unwelcome. */
const prefersLessData = (): boolean => {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return Boolean(connection?.saveData);
};

/**
 * Builds a function that starts `load` in the background, once. A failed load is
 * forgotten so a later call (or the real navigation) can try again.
 */
export const createPrefetcher = (load: () => Promise<unknown>) => {
  let requested = false;

  return (): void => {
    if (requested || prefersLessData()) return;
    requested = true;

    const start = () => {
      load().catch(() => {
        requested = false;
      });
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(start, { timeout: 3000 });
    } else {
      window.setTimeout(start, 200);
    }
  };
};

/** Starts loading the editor in the background. Safe to call from event handlers and effects. */
export const prefetchEditor = createPrefetcher(loadEditorPage);
