import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/server.js';
import buildExecutor from '../src/services/buildExecutor.js';
import { searchWorkspaceFiles, replaceWorkspaceFiles } from '../src/services/workspaceService.js';
import { getProofdeskDataPath } from '../src/utils/dataPaths.js';

describe('Workspace Global Search & Replace', () => {
  const sessionId = 'aaaaaaaaaaaaaaaa';
  const repoPath = getProofdeskDataPath(sessionId, 'repo');

  before(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
    await fs.mkdir(repoPath, { recursive: true });

    await fs.writeFile(path.join(repoPath, 'file1.xml'), '<chapter><title>Old Term Header</title></chapter>', 'utf-8');
    await fs.writeFile(path.join(repoPath, 'file2.xml'), '<section><p>Another Old Term paragraph.</p></section>', 'utf-8');

    buildExecutor.sessions.set(sessionId, {
      id: sessionId,
      owner: 'demo',
      repo: 'course-demo',
      repoPath,
      outputPath: repoPath,
      defaultBranch: 'main',
    });
  });

  after(async () => {
    buildExecutor.sessions.delete(sessionId);
    await fs.rm(repoPath, { recursive: true, force: true });
  });

  it('searches workspace files for terms', async () => {
    const results = await searchWorkspaceFiles(sessionId, 'Old Term');
    assert.equal(results.length, 2);
  });

  it('replaces query matches across workspace files via replaceWorkspaceFiles', async () => {
    const result = await replaceWorkspaceFiles(sessionId, 'Old Term', 'New Replacement');
    assert.equal(result.success, true);
    assert.equal(result.filesModified, 2);
    assert.equal(result.totalReplacements, 2);

    const content1 = await fs.readFile(path.join(repoPath, 'file1.xml'), 'utf-8');
    assert.ok(content1.includes('New Replacement Header'));

    const content2 = await fs.readFile(path.join(repoPath, 'file2.xml'), 'utf-8');
    assert.ok(content2.includes('Another New Replacement paragraph.'));
  });

  it('replaces occurrences via POST /workspace/:sessionId/replace API endpoint', async () => {
    const res = await request(app)
      .post(`/workspace/${sessionId}/replace`)
      .set('Authorization', 'Bearer local-test')
      .send({
        query: 'New Replacement',
        replacement: 'Final Term',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.filesModified, 2);
    assert.equal(res.body.totalReplacements, 2);

    const content1 = await fs.readFile(path.join(repoPath, 'file1.xml'), 'utf-8');
    assert.ok(content1.includes('Final Term Header'));
  });
});
