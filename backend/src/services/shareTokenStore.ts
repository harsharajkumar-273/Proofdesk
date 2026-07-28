// shareTokenStore.ts
// Stores time-limited share tokens that map to a build session's output.
// Persisted to disk so tokens survive server restarts.
// No Redis dependency — mirrors the pattern used by authSessionStore.

import fs from 'fs/promises';
import crypto from 'crypto';
import { getProofdeskDataPath } from '../utils/dataPaths.js';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const STORE_FILE = () => getProofdeskDataPath('.share-tokens.json');

export interface ShareTokenEntry {
  sessionId: string;
  outputPath: string;
  repoPath: string;
  entryFile: string;
  createdAt: number;
  expiresAt: number;
}

interface TokenCache {
  [token: string]: ShareTokenEntry;
}

let cache: TokenCache | null = null;

// In-flight load, shared by every concurrent caller.
//
// Without this, two requests arriving before the first read completes both see
// `cache === null` and both issue their own `readFile`, ending up with two
// *different* objects. Each then mutates its own copy and persists it, so
// whichever write lands second silently drops the other's token.
let loadPromise: Promise<TokenCache> | null = null;

// Serializes writes. `persist` is called from more than one code path and each
// call previously raced the others through `fs.writeFile` on the same path.
let persistQueue: Promise<void> = Promise.resolve();

const load = async (): Promise<TokenCache> => {
  if (cache) return cache;

  if (!loadPromise) {
    loadPromise = (async (): Promise<TokenCache> => {
      try {
        const raw = await fs.readFile(STORE_FILE(), 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        // A truncated or corrupted file parses to something that is not a
        // token map; treat that as empty rather than handing back a bad shape.
        cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as TokenCache)
          : {};
      } catch {
        cache = {};
      }
      return cache;
    })();
  }

  return loadPromise;
};

/**
 * Writes the store by creating a temporary file and renaming it over the
 * target.
 *
 * `fs.writeFile` truncates and then writes, so a concurrent reader — or a
 * crash — can observe a partially written file. `load` reacts to a parse
 * failure by resetting to `{}`, which turns a torn write into the silent loss
 * of every token, so partial states must never become visible.
 *
 * `rename` is atomic within a filesystem, hence the temporary file living in
 * the same directory as the target: a reader sees either the whole previous
 * file or the whole new one. The name is randomised so two writers never
 * collide on the temporary path itself, and the handle is flushed before the
 * rename so the rename cannot expose an empty file after a crash.
 */
const writeAtomic = async (tokens: TokenCache): Promise<void> => {
  const target = STORE_FILE();
  await fs.mkdir(getProofdeskDataPath(), { recursive: true });

  const tmp = `${target}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const payload = JSON.stringify(tokens, null, 2);

  try {
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(payload, 'utf-8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
};

const persist = async (tokens: TokenCache): Promise<void> => {
  // Chain onto the queue so only one write runs at a time. The queue is
  // advanced with a swallowed rejection so one failed write does not wedge
  // every later one.
  const run = persistQueue.then(() => writeAtomic(tokens));
  persistQueue = run.catch(() => {});

  try {
    await run;
  } catch (err: any) {
    // Preserves the original contract: persistence failures are logged, not
    // thrown at the caller.
    console.error('[ShareTokenStore] persist error:', err.message);
  }
};

const pruneExpired = (tokens: TokenCache): boolean => {
  const now = Date.now();
  let changed = false;
  for (const token of Object.keys(tokens)) {
    if (tokens[token].expiresAt < now) {
      delete tokens[token];
      changed = true;
    }
  }
  return changed;
};

export const createShareToken = async ({
  sessionId,
  outputPath,
  repoPath,
  entryFile,
}: {
  sessionId: string;
  outputPath: string;
  repoPath: string;
  entryFile?: string;
}): Promise<string> => {
  const tokens = await load();
  pruneExpired(tokens);

  const token = crypto.randomBytes(16).toString('hex');
  tokens[token] = {
    sessionId,
    outputPath,
    repoPath,
    entryFile: entryFile || 'overview.html',
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };

  cache = tokens;
  await persist(tokens);
  return token;
};

export const getShareToken = async (token: string): Promise<ShareTokenEntry | null> => {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;

  const tokens = await load();
  const entry = tokens[token];
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    delete tokens[token];
    cache = tokens;
    await persist(tokens);
    return null;
  }
  return entry;
};
