/* eslint-disable @typescript-eslint/no-explicit-any */
let pyodideInstance: any = null;
let loadingPromise: Promise<any> | null = null;

/**
 * Dynamically injects Pyodide scripts from CDN and initializes the WASM environment
 */
export const loadPyodideRuntime = async (): Promise<any> => {
  if (pyodideInstance) return pyodideInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    // Check if script is already present
    if ((window as any).loadPyodide) {
      (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
      })
        .then((instance: any) => {
          pyodideInstance = instance;
          resolve(instance);
        })
        .catch(reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
    script.async = true;
    script.onload = () => {
      (window as any).loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
      })
        .then((instance: any) => {
          pyodideInstance = instance;
          resolve(instance);
        })
        .catch(reject);
    };
    script.onerror = (err) => {
      reject(new Error('Failed to load Pyodide runtime from CDN: ' + String(err)));
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
};
