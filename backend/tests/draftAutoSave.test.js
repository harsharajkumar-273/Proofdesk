import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { app } from '../src/server.js';
import buildExecutor from '../src/services/buildExecutor.js';
import { createWorkspaceDraftCommit, getWorkspaceDraftStatus } from '../src/services/gitWorkspaceService.js';
import { getProofdeskDataPath } from '../src/utils/dataPaths.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('Draft Auto-Save & Commit History API', () => {
  const sessionId = 'aaaaaaaaaaaaaaaa';
  const repoPath = getProofdeskDataPath(sessionId, 'repo');

  before(async () => {
    await fs.rm(repoPath, { recursive: true, force: true });
    await fs.mkdir(repoPath, { recursive: true });

    // Initialize git repository
    await execFileAsync('git', ['init'], { cwd: repoPath });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: repoPath });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath });

    await fs.writeFile(path.join(repoPath, 'index.ptx'), '<pretext><doc>Initial</doc></pretext>', 'utf-8');
    await execFileAsync('git', ['add', '.'], { cwd: repoPath });
    await execFileAsync('git', ['commit', '-m', 'initial commit'], { cwd: repoPath });

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

  it('skips draft commit when workspace has no changes', async () => {
    const res = await createWorkspaceDraftCommit(sessionId);
    assert.equal(res.created, false);
    assert.ok(res.message.includes('No uncommitted changes'));
  });

  it('creates draft commit when workspace files are modified', async () => {
    await fs.writeFile(path.join(repoPath, 'index.ptx'), '<pretext><doc>Updated draft content</doc></pretext>', 'utf-8');

    const res = await createWorkspaceDraftCommit(sessionId);
    assert.equal(res.created, true);
    assert.ok(res.commitSha);
    assert.ok(res.message.includes('draft(auto-save)'));

    const status = getWorkspaceDraftStatus(sessionId);
    assert.equal(status.lastCommitSha, res.commitSha);
  });

  it('triggers draft auto-save via POST /workspace/:sessionId/drafts/auto-save API', async () => {
    await fs.writeFile(path.join(repoPath, 'chapter1.ptx'), '<chapter><title>New Chapter</title></chapter>', 'utf-8');

    const res = await request(app)
      .post(`/workspace/${sessionId}/drafts/auto-save`)
      .set('Authorization', 'Bearer local-test')
      .send({ message: 'draft(auto-save): API test draft' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.created, true);
    assert.ok(res.body.commitSha);
  });

  it('returns draft status via GET /workspace/:sessionId/drafts/status API', async () => {
    const res = await request(app)
      .get(`/workspace/${sessionId}/drafts/status`)
      .set('Authorization', 'Bearer local-test');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.lastAutoSave);
  });
});
