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

const load = async (): Promise<TokenCache> => {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STORE_FILE(), 'utf-8');
    cache = JSON.parse(raw) as TokenCache;
  } catch {
    cache = {};
  }
  return cache;
};

const persist = async (tokens: TokenCache): Promise<void> => {
  try {
    const parentDir = getProofdeskDataPath();
    await fs.mkdir(parentDir, { recursive: true });
    await fs.writeFile(STORE_FILE(), JSON.stringify(tokens, null, 2), 'utf-8');
  } catch (err: any) {
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
