import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getProofdeskDataPath } from '../utils/dataPaths.js';

const MAX_PREVIEW_SNAPSHOTS = 12;

const getHistoryDir = (sessionId) => getProofdeskDataPath('preview-history', sessionId);
const getHistoryManifestPath = (sessionId) => path.join(getHistoryDir(sessionId), 'manifest.json');
const getSnapshotPath = (sessionId, snapshotId) => path.join(getHistoryDir(sessionId), `${snapshotId}.html`);

const stripHtml = (html) =>
  String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();

const summarizeTextChanges = (beforeText = '', afterText = '') => {
  const beforeLines = beforeText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const afterLines = afterText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const maxLength = Math.max(beforeLines.length, afterLines.length);

  let changedLines = 0;
  let addedLines = 0;
  let removedLines = 0;
  let preview = '';

  for (let index = 0; index < maxLength; index += 1) {
    const previous = beforeLines[index];
    const next = afterLines[index];
    if (previous === next) continue;

    changedLines += 1;
    if (previous === undefined) {
      addedLines += 1;
    } else if (next === undefined) {
      removedLines += 1;
    } else {
      addedLines += 1;
      removedLines += 1;
    }

    if (!preview) {
      preview = (next || previous || '').replace(/\s+/g, ' ').slice(0, 180);
    }
  }

  return {
    changedLines,
    addedLines,
    removedLines,
    preview,
  };
};

const readManifest = async (sessionId) => {
  try {
    const raw = await fs.readFile(getHistoryManifestPath(sessionId), 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.snapshots) ? parsed.snapshots : [];
  } catch {
    return [];
  }
};

const writeManifest = async (sessionId, snapshots) => {
  const manifestPath = getHistoryManifestPath(sessionId);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ version: 1, snapshots }, null, 2),
    'utf-8'
  );
};

export const listPreviewSnapshots = async (sessionId) => {
  const snapshots = await readManifest(sessionId);
  return snapshots.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

export const readPreviewSnapshotHtml = async (sessionId, snapshotId) =>
  fs.readFile(getSnapshotPath(sessionId, snapshotId), 'utf-8');

export const recordPreviewSnapshot = async ({
  sessionId,
  previewPath,
  entryFile,
  label = 'Build',
}) => {
  if (!sessionId || !previewPath || !entryFile) return null;

  const snapshotSourcePath = path.join(previewPath, entryFile);
  const html = await fs.readFile(snapshotSourcePath, 'utf-8');
  const plainText = stripHtml(html);
  const snapshots = await readManifest(sessionId);
  const previous = snapshots[0] || null;

  let changeSummary = {
    changedLines: 0,
    addedLines: 0,
    removedLines: 0,
    preview: 'Initial preview snapshot',
  };

  if (previous?.snapshotId) {
    try {
      const previousHtml = await readPreviewSnapshotHtml(sessionId, previous.snapshotId);
      changeSummary = summarizeTextChanges(stripHtml(previousHtml), plainText);
    } catch {
      // Keep the default summary when the previous snapshot is unavailable.
    }
  }

  const snapshotId = crypto.randomBytes(6).toString('hex');
  const createdAt = new Date().toISOString();
  await fs.mkdir(getHistoryDir(sessionId), { recursive: true });
  await fs.writeFile(getSnapshotPath(sessionId, snapshotId), html, 'utf-8');

  const nextEntry = {
    snapshotId,
    entryFile,
    label,
    createdAt,
    excerpt: plainText.slice(0, 220),
    textLength: plainText.length,
    changeSummary,
  };

  const nextSnapshots = [nextEntry, ...snapshots].slice(0, MAX_PREVIEW_SNAPSHOTS);
  await writeManifest(sessionId, nextSnapshots);

  const staleSnapshots = snapshots.slice(MAX_PREVIEW_SNAPSHOTS);
  await Promise.all(
    staleSnapshots.map(async (snapshot) => {
      if (!snapshot?.snapshotId) return;
      await fs.rm(getSnapshotPath(sessionId, snapshot.snapshotId), { force: true });
    })
  );

  return nextEntry;
};
