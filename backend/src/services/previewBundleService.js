import fs from 'fs/promises';
import path from 'path';
import {
  PREVIEW_SHARED_ROOT_DIRS,
  transformPreviewFile,
} from './previewTransformService.js';
import { getProofdeskDataPath } from '../utils/dataPaths.js';

const PREVIEW_REPO_MIRROR_DIRS = [
  ...PREVIEW_SHARED_ROOT_DIRS,
  'css',
  'js',
  'demos',
  'knowl',
];

const inFlightSyncs = new Map();

const getPreviewBundleRoot = (sessionId) => getProofdeskDataPath(sessionId, 'preview');

const walkDir = async (dir) => {
  const files = [];
  let entries = [];

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkDir(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
};

const writePreviewFile = async ({ previewRoot, relativePath, rawContent, sessionId }) => {
  const outputPath = path.join(previewRoot, relativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const transformed = transformPreviewFile(relativePath, rawContent, sessionId);
  await fs.writeFile(outputPath, transformed);
};

const mirrorTree = async ({ sourceRoot, previewRoot, sessionId, onlyIfMissing = false }) => {
  const files = await walkDir(sourceRoot);

  for (const filePath of files) {
    const relativePath = path.relative(sourceRoot, filePath);
    const targetPath = path.join(previewRoot, relativePath);

    if (onlyIfMissing) {
      const exists = await fs.access(targetPath).then(() => true).catch(() => false);
      if (exists) continue;
    }

    const ext = path.extname(relativePath).toLowerCase();
    if (ext === '.html' || ext === '.css' || ext === '.js' || ext === '.json' || ext === '.xml' || ext === '.txt') {
      const rawContent = await fs.readFile(filePath, 'utf-8');
      await writePreviewFile({ previewRoot, relativePath, rawContent, sessionId });
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(filePath, targetPath);
  }
};

const mirrorSelectedRepoDirs = async ({ repoPath, previewRoot, sessionId }) => {
  for (const relativeDir of PREVIEW_REPO_MIRROR_DIRS) {
    const sourcePath = path.join(repoPath, relativeDir);
    const exists = await fs.access(sourcePath).then(() => true).catch(() => false);
    if (!exists) continue;
    await mirrorTree({
      sourceRoot: sourcePath,
      previewRoot: path.join(previewRoot, relativeDir),
      sessionId,
      onlyIfMissing: true,
    });
  }
};

export const syncPreviewBundle = async ({ sessionId, outputPath, repoPath }) => {
  const previewRoot = getPreviewBundleRoot(sessionId);
  await fs.rm(previewRoot, { recursive: true, force: true });
  await fs.mkdir(previewRoot, { recursive: true });

  await mirrorTree({
    sourceRoot: outputPath,
    previewRoot,
    sessionId,
  });

  if (repoPath) {
    await mirrorSelectedRepoDirs({ repoPath, previewRoot, sessionId });
  }

  return previewRoot;
};

export const ensurePreviewBundle = async ({ sessionId, outputPath, repoPath }) => {
  const previewRoot = getPreviewBundleRoot(sessionId);
  const hasBundle = await fs.access(previewRoot).then(() => true).catch(() => false);

  if (hasBundle) {
    return previewRoot;
  }

  if (!inFlightSyncs.has(sessionId)) {
    inFlightSyncs.set(
      sessionId,
      syncPreviewBundle({ sessionId, outputPath, repoPath }).finally(() => {
        inFlightSyncs.delete(sessionId);
      })
    );
  }

  return inFlightSyncs.get(sessionId);
};

export const updatePreviewBundleFile = async ({ sessionId, filePath, content }) => {
  const previewRoot = getPreviewBundleRoot(sessionId);
  await fs.mkdir(path.dirname(path.join(previewRoot, filePath)), { recursive: true });
  await writePreviewFile({
    previewRoot,
    relativePath: filePath,
    rawContent: content,
    sessionId,
  });
  return path.join(previewRoot, filePath);
};

export const getPreviewBundlePath = getPreviewBundleRoot;
