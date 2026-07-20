import path from 'path';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';

const rootDir = process.cwd();
const candidateEnvFiles = [
  path.join(rootDir, 'backend', '.env.local'),
  path.join(rootDir, 'backend', '.env'),
  path.join(rootDir, '.env.local'),
  path.join(rootDir, '.env'),
];

candidateEnvFiles.forEach((filePath) => {
  dotenv.config({ path: filePath });
});

const normalizeRepo = (value) => {
  const raw = String(value || '').trim().replace(/\.git$/, '');
  if (!raw) return '';

  const urlMatch = raw.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2]}`;
  }

  const parts = raw.split('/').filter(Boolean);
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : '';
};

const prewarmRepo = String(process.env.PREWARM_REPOS || '')
  .split(',')
  .map((entry) => normalizeRepo(entry))
  .find(Boolean) || '';

const token = process.env.E2E_GITHUB_TOKEN || process.env.GITHUB_PERSONAL_TOKEN || '';
const repo = normalizeRepo(process.env.E2E_GITHUB_REPO || process.env.PROOFDESK_SMOKE_REPO || prewarmRepo);
const targetFile = process.env.E2E_GITHUB_FILE || '';
const previewText = process.env.E2E_GITHUB_PREVIEW_TEXT || '';

if (!token) {
  console.error(
    'Live GitHub smoke test needs a personal access token. Set E2E_GITHUB_TOKEN or GITHUB_PERSONAL_TOKEN in backend/.env.local.'
  );
  process.exit(1);
}

if (!repo) {
  console.error(
    'Live GitHub smoke test needs a repository. Set E2E_GITHUB_REPO or PROOFDESK_SMOKE_REPO (for example QBobWatson/ila).'
  );
  process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(
  npmCommand,
  ['run', 'test:e2e:github'],
  {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_GITHUB_TOKEN: token,
      E2E_GITHUB_REPO: repo,
      E2E_GITHUB_FILE: targetFile,
      E2E_GITHUB_PREVIEW_TEXT: previewText,
    },
  }
);

process.exit(result.status ?? 1);
