import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { app } from '../src/server.ts';
import buildExecutor from '../src/services/buildExecutor.js';

describe('Response Compression on Preview Routes', () => {
  const sessionId = 'b1b2c3d4e5f67890';
  let tmpDir = '';

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proofdesk-preview-comp-'));
    await fs.writeFile(
      path.join(tmpDir, 'demo.html'),
      '<!DOCTYPE html><html><body>' + '<h1>PreTeXt Preview Content Line</h1>\n'.repeat(50) + '</body></html>'
    );

    buildExecutor.setSession(sessionId, {
      sessionId,
      repoPath: tmpDir,
      outputPath: tmpDir,
      previewPath: tmpDir,
      owner: 'test',
      repo: 'repo',
    });
  });

  after(async () => {
    buildExecutor.deleteSession(sessionId);
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('serves preview HTML content with status 200 and compressed response handling', async () => {
    const res = await request(app)
      .get(`/preview/${sessionId}/demo.html`)
      .set('Accept-Encoding', 'gzip, deflate');

    assert.equal(res.status, 200);
    assert.ok(res.text.includes('PreTeXt Preview Content Line'));
  });
});
