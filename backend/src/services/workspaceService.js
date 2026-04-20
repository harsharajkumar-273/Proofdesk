import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import buildExecutor from './buildExecutor.js';
import { getProofdeskDataPath } from '../utils/dataPaths.js';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const hashContent = (content) =>
  crypto.createHash('sha1').update(content).digest('hex');

const assertValidSessionId = (sessionId) => {
  if (!/^[0-9a-f]{16}$/.test(String(sessionId || ''))) {
    throw new Error('Invalid session ID');
  }
};

const ensureChildPath = (basePath, relativePath = '') => {
  const resolved = path.resolve(basePath, relativePath);
  if (!resolved.startsWith(`${basePath}${path.sep}`) && resolved !== basePath) {
    throw new Error('Access denied');
  }
  return resolved;
};

const toTreeEntry = async (rootPath, relativePath, entry) => {
  const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
  const fullPath = path.join(rootPath, entryPath);
  const stats = entry.isDirectory() ? null : await fs.stat(fullPath);

  return {
    name: entry.name,
    path: entryPath,
    type: entry.isDirectory() ? 'dir' : 'file',
    sha: entry.isDirectory() ? undefined : hashContent(`${entryPath}:${stats?.mtimeMs || 0}:${stats?.size || 0}`),
    size: stats?.size,
  };
};

export const prepareWorkspace = async (owner, repo, token, options = {}) => {
  const prepared = await buildExecutor.prepareRepository(owner, repo, token, options);
  const session = buildExecutor.sessions.get(prepared.sessionId);

  if (!session) {
    throw new Error('Workspace session could not be created');
  }

  return {
    sessionId: prepared.sessionId,
    repoPath: session.repoPath,
    outputPath: session.outputPath,
    fromCache: prepared.fromCache,
    repoFullName: `${session.owner}/${session.repo}`,
  };
};

export const getWorkspaceSession = (sessionId) => {
  assertValidSessionId(sessionId);
  const session = buildExecutor.sessions.get(sessionId);
  if (!session?.repoPath) {
    throw new Error('Workspace session not found');
  }
  return session;
};

export const getWorkspaceTree = async (sessionId, relativePath = '') => {
  const session = getWorkspaceSession(sessionId);
  const repoPath = path.resolve(session.repoPath);
  const targetPath = ensureChildPath(repoPath, relativePath);
  const entries = await fs.readdir(targetPath, { withFileTypes: true });

  const visibleEntries = entries.filter((entry) => !(entry.isDirectory() && entry.name === '.git'));
  const mapped = await Promise.all(
    visibleEntries.map((entry) => toTreeEntry(repoPath, relativePath, entry))
  );

  return mapped.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'dir' ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
};

export const getWorkspaceFileContent = async (sessionId, relativePath) => {
  const session = getWorkspaceSession(sessionId);
  const repoPath = path.resolve(session.repoPath);
  const targetPath = ensureChildPath(repoPath, relativePath);
  const content = await fs.readFile(targetPath, 'utf-8');
  const sha = hashContent(content);

  return {
    name: path.basename(relativePath),
    path: relativePath,
    type: 'file',
    sha,
    size: Buffer.byteLength(content, 'utf-8'),
    encoding: 'base64',
    content: Buffer.from(content, 'utf-8').toString('base64'),
    decoded_content: content,
  };
};

export const updateWorkspaceFileContent = async (sessionId, relativePath, content) => {
  const session = getWorkspaceSession(sessionId);
  const repoPath = path.resolve(session.repoPath);
  const targetPath = ensureChildPath(repoPath, relativePath);

  const byteLength = Buffer.byteLength(content, 'utf-8');
  if (byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`);
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf-8');

  const sha = hashContent(content);
  return {
    content: {
      name: path.basename(relativePath),
      path: relativePath,
      sha,
    },
  };
};

export const readWorkspaceTextFile = async (sessionId, relativePath) => {
  const session = getWorkspaceSession(sessionId);
  const repoPath = path.resolve(session.repoPath);
  const targetPath = ensureChildPath(repoPath, relativePath);
  return fs.readFile(targetPath, 'utf-8');
};

// ── Review markers persistence ────────────────────────────────────────────────

const getReviewMarkersPath = (sessionId) =>
  getProofdeskDataPath('review-markers', `${sessionId}.json`);

export const getWorkspaceReviewMarkers = async (sessionId) => {
  // Validates sessionId and throws if session doesn't exist
  getWorkspaceSession(sessionId);

  try {
    const raw = await fs.readFile(getReviewMarkersPath(sessionId), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export const saveWorkspaceReviewMarkers = async (sessionId, markers) => {
  getWorkspaceSession(sessionId);

  if (typeof markers !== 'object' || Array.isArray(markers) || markers === null) {
    throw new Error('markers must be a plain object');
  }

  const filePath = getReviewMarkersPath(sessionId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(markers), 'utf-8');
};

// ── Full-text content search ──────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.tex', '.xml', '.ptx', '.html', '.htm', '.css', '.js',
  '.ts', '.tsx', '.jsx', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.py', '.rb', '.java', '.c', '.cpp', '.h', '.hpp', '.sh', '.bash', '.zsh',
  '.rst', '.bib', '.cls', '.sty',
]);

const MAX_SEARCH_RESULTS = 50;
const MAX_SEARCH_FILE_SIZE = 1024 * 1024; // 1 MB per file

const walkForSearch = async (dir, rootPath, results = []) => {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip hidden files/.git

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (results.length < MAX_SEARCH_RESULTS * 5) {
        await walkForSearch(fullPath, rootPath, results);
      }
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }

  return results;
};

export const searchWorkspaceFiles = async (sessionId, query) => {
  const session = getWorkspaceSession(sessionId);
  const repoPath = path.resolve(session.repoPath);

  const lowerQuery = query.toLowerCase();
  const allFiles = await walkForSearch(repoPath, repoPath);

  const results = [];

  for (const filePath of allFiles) {
    if (results.length >= MAX_SEARCH_RESULTS) break;

    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_SEARCH_FILE_SIZE) continue;

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const relativePath = path.relative(repoPath, filePath);
      const matches = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          matches.push({
            line: i + 1,
            text: lines[i].trimEnd().slice(0, 300),
          });
          if (matches.length >= 5) break; // max 5 matches per file
        }
      }

      if (matches.length > 0) {
        results.push({ path: relativePath, matches });
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
};
