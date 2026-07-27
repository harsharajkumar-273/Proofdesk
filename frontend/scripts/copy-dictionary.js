/**
 * Copies the Hunspell dictionary that powers prose spell checking into
 * `public/dictionaries/` so it can be fetched at runtime.
 *
 * Why this exists: `dictionary-en` is a Node-only package. Its entry point
 * reads `index.aff` / `index.dic` via `node:fs/promises`, and its `exports`
 * map ("./index.js") prevents deep-importing the raw files, so it cannot be
 * bundled for the browser. Copying the two raw files into `public/` keeps the
 * word list out of the JS bundle, keeps `dictionary-en` a devDependency, and
 * lets the checker load the dictionary lazily on first use.
 *
 * Runs automatically via the `predev` and `prebuild` npm scripts. The copied
 * files are gitignored — they are build output, not source.
 */

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(scriptDir, '..');
const targetDir = join(frontendRoot, 'public', 'dictionaries');

const FILES = ['index.aff', 'index.dic'];

/** Locates the installed `dictionary-en` package directory. */
const resolveDictionaryDir = () => {
  // `dictionary-en`'s exports field is the bare string "./index.js", which
  // exposes the main entry and nothing else — `dictionary-en/package.json`
  // resolves to ERR_PACKAGE_PATH_NOT_EXPORTED. Resolve the one exported
  // specifier and take its directory instead.
  const entry = require.resolve('dictionary-en');
  return dirname(entry);
};

const main = async () => {
  let sourceDir;
  try {
    sourceDir = resolveDictionaryDir();
  } catch {
    console.error(
      '[copy-dictionary] Could not resolve "dictionary-en". ' +
        'Run `npm install` in frontend/ before building.',
    );
    process.exit(1);
  }

  await mkdir(targetDir, { recursive: true });

  for (const file of FILES) {
    const from = join(sourceDir, file);
    const to = join(targetDir, file);
    try {
      await stat(from);
    } catch {
      console.error(`[copy-dictionary] Missing expected file: ${from}`);
      process.exit(1);
    }
    await copyFile(from, to);
  }

  console.log(`[copy-dictionary] Copied ${FILES.join(', ')} -> public/dictionaries/`);
};

main().catch((error) => {
  console.error('[copy-dictionary] Failed:', error);
  process.exit(1);
});
