const PYODIDE_BASE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/';

/** The subset of the Pyodide runtime API that Proofdesk uses. */
export interface PyodideRuntime {
  /** Proofdesk's Python helpers only ever return strings. */
  runPython: (code: string) => string;
  globals: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  };
}

type LoadPyodide = (options: { indexURL: string }) => Promise<PyodideRuntime>;

declare global {
  interface Window {
    loadPyodide?: LoadPyodide;
  }
}

let pyodideInstance: PyodideRuntime | null = null;
let loadingPromise: Promise<PyodideRuntime> | null = null;

/**
 * Dynamically injects Pyodide scripts from CDN and initializes the WASM environment
 */
export const loadPyodideRuntime = async (): Promise<PyodideRuntime> => {
  if (pyodideInstance) return pyodideInstance;
  if (loadingPromise) return loadingPromise;

  const initialize = (loadPyodide: LoadPyodide) =>
    loadPyodide({ indexURL: PYODIDE_BASE_URL }).then((instance) => {
      pyodideInstance = instance;
      return instance;
    });

  loadingPromise = new Promise<PyodideRuntime>((resolve, reject) => {
    // Check if script is already present
    if (window.loadPyodide) {
      initialize(window.loadPyodide).then(resolve, reject);
      return;
    }

    const script = document.createElement('script');
    script.src = `${PYODIDE_BASE_URL}pyodide.js`;
    script.async = true;
    script.onload = () => {
      if (!window.loadPyodide) {
        reject(new Error('Pyodide script loaded but window.loadPyodide is missing'));
        return;
      }
      initialize(window.loadPyodide).then(resolve, reject);
    };
    script.onerror = (err) => {
      reject(new Error('Failed to load Pyodide runtime from CDN: ' + String(err)));
    };
    document.head.appendChild(script);
  });

  // Allow a retry after a failed load instead of caching the rejection forever.
  loadingPromise.catch(() => {
    loadingPromise = null;
  });

  return loadingPromise;
};
