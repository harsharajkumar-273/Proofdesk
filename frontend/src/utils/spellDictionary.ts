/**
 * Browser-safe Hunspell dictionary loading for the prose spell checker.
 *
 * `dictionary-en` cannot be imported in a browser: its single entry point
 * reads `index.aff` / `index.dic` through `node:fs/promises`, and its
 * `exports` map ("./index.js") blocks deep-importing the raw files. Bundling
 * it would typecheck, pass Node-based tests, and then silently fail at
 * runtime.
 *
 * Instead the two raw files are copied into `public/dictionaries/` by the
 * `predev`/`prebuild` script (see `scripts/copy-dictionary.js`) and fetched
 * here at runtime. That keeps `dictionary-en` a devDependency, keeps the
 * 550 KB word list out of the JS bundle entirely, and makes loading naturally
 * lazy — nothing is downloaded until the first spell check runs.
 */

import nspell from 'nspell';
import type { SpellChecker } from './proseSpellCheck';

/** Where `scripts/copy-dictionary.js` writes the Hunspell files. */
const DICTIONARY_DIR = 'dictionaries';
const AFF_FILE = 'index.aff';
const DIC_FILE = 'index.dic';

let loadPromise: Promise<SpellChecker | null> | null = null;

/**
 * Resolves a public-directory asset against the app's base URL, so the fetch
 * still works when Proofdesk is served from a sub-path rather than the domain
 * root.
 */
const publicAssetUrl = (fileName: string): string => {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${DICTIONARY_DIR}/${fileName}`;
};

const fetchText = async (fileName: string, signal?: AbortSignal): Promise<string> => {
  const url = publicAssetUrl(fileName);
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
};

/**
 * Loads the dictionary and returns a checker, or `null` if loading failed.
 *
 * Failure is deliberately non-fatal and returns `null` rather than throwing:
 * a missing dictionary should disable spell checking, never break the editor.
 * The result is cached, including a failed load, so a broken deployment does
 * not re-fetch on every keystroke.
 */
export const loadSpellChecker = (signal?: AbortSignal): Promise<SpellChecker | null> => {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const [aff, dic] = await Promise.all([
          fetchText(AFF_FILE, signal),
          fetchText(DIC_FILE, signal),
        ]);
        return nspell(aff, dic) as SpellChecker;
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          // Aborted loads must not poison the cache — allow a later retry.
          loadPromise = null;
          return null;
        }
        console.warn('[proofdesk] Prose spell checking is unavailable:', error);
        return null;
      }
    })();
  }
  return loadPromise;
};

/** Test seam: clears the cached load so a fresh attempt can be made. */
export const resetSpellCheckerCache = (): void => {
  loadPromise = null;
};
