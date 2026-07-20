import fs from 'fs/promises';
import { Dirent } from 'fs';
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

const inFlightSyncs = new Map<string, Promise<string>>();

const getPreviewBundleRoot = (sessionId: string): string => getProofdeskDataPath(sessionId, 'preview');

const walkDir = async (dir: string): Promise<string[]> => {
  const files: string[] = [];
  let entries: Dirent[] = [];

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
};

const writePreviewFile = async ({
  previewRoot,
  relativePath,
  rawContent,
  sessionId,
}: {
  previewRoot: string;
  relativePath: string;
  rawContent: string;
  sessionId: string;
}): Promise<void> => {
  const outputPath = path.join(previewRoot, relativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const transformed = transformPreviewFile(relativePath, rawContent, sessionId);
  await fs.writeFile(outputPath, transformed);
};

const mirrorTree = async ({
  sourceRoot,
  previewRoot,
  sessionId,
  onlyIfMissing = false,
}: {
  sourceRoot: string;
  previewRoot: string;
  sessionId: string;
  onlyIfMissing?: boolean;
}): Promise<void> => {
  const files = await walkDir(sourceRoot);

  for (const filePath of files) {
    const relativePath = path.relative(sourceRoot, filePath);
    const targetPath = path.join(previewRoot, relativePath);

    if (onlyIfMissing) {
      const exists = await fs.access(targetPath).then(() => true).catch(() => false);
      if (exists) continue;
    }

    const ext = path.extname(relativePath).toLowerCase();
    if (
      ext === '.html' ||
      ext === '.css' ||
      ext === '.js' ||
      ext === '.json' ||
      ext === '.xml' ||
      ext === '.txt'
    ) {
      const rawContent = await fs.readFile(filePath, 'utf-8');
      await writePreviewFile({ previewRoot, relativePath, rawContent, sessionId });
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(filePath, targetPath);
  }
};

const mirrorSelectedRepoDirs = async ({
  repoPath,
  previewRoot,
  sessionId,
}: {
  repoPath: string;
  previewRoot: string;
  sessionId: string;
}): Promise<void> => {
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

export const syncPreviewBundle = async ({
  sessionId,
  outputPath,
  repoPath,
}: {
  sessionId: string;
  outputPath: string;
  repoPath?: string | null;
}): Promise<string> => {
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

export const ensurePreviewBundle = async ({
  sessionId,
  outputPath,
  repoPath,
}: {
  sessionId: string;
  outputPath: string;
  repoPath?: string | null;
}): Promise<string> => {
  const previewRoot = getPreviewBundleRoot(sessionId);
  const hasBundle = await fs.access(previewRoot).then(() => true).catch(() => false);

  if (hasBundle) {
    return previewRoot;
  }

  const existingSync = inFlightSyncs.get(sessionId);
  if (existingSync) {
    return existingSync;
  }

  const syncPromise = syncPreviewBundle({ sessionId, outputPath, repoPath }).finally(() => {
    inFlightSyncs.delete(sessionId);
  });

  inFlightSyncs.set(sessionId, syncPromise);
  return syncPromise;
};

export const updatePreviewBundleFile = async ({
  sessionId,
  filePath,
  content,
}: {
  sessionId: string;
  filePath: string;
  content: string;
}): Promise<string> => {
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
