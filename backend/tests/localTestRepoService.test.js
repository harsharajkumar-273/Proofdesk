import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import localTestRepoService from '../src/services/localTestRepoService.js';

const tempRoots = [];

const makeTempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'proofdesk-local-demo-'));
  tempRoots.push(dir);
  return dir;
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('local test repository preview rendering', () => {
  it('keeps course title and subtitle as separate attributes', async () => {
    const tempRoot = await makeTempDir();
    const repoPath = path.join(tempRoot, 'repo');
    const outputPath = path.join(tempRoot, 'output');

    await fs.mkdir(repoPath, { recursive: true });
    await fs.writeFile(
      path.join(repoPath, 'course.xml'),
      `<course title="Professor Demo Check" subtitle="Testing live edits and preview rebuilds">
  <section title="Vectors">
    <paragraph>This paragraph was updated during the live editing test.</paragraph>
  </section>
</course>`,
      'utf-8'
    );

    await localTestRepoService.buildOutput(repoPath, outputPath);

    const html = await fs.readFile(path.join(outputPath, 'index.html'), 'utf-8');
    assert.match(html, /<h1>Professor Demo Check<\/h1>/);
    assert.match(html, /<p>Testing live edits and preview rebuilds<\/p>/);
    assert.match(html, /This paragraph was updated during the live editing test\./);
  });
});
