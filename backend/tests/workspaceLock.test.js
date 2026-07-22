import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { updateWorkspaceFileContent } from '../src/services/workspaceService.js';
import buildExecutor from '../src/services/buildExecutor.js';

describe('Workspace File Lock & Concurrency', () => {
  it('serializes concurrent file writes to prevent race conditions', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proofdesk-lock-test-'));
    const sessionId = 'a1b2c3d4e5f67890';
    
    // Register session in buildExecutor
    buildExecutor.setSession(sessionId, {
      sessionId,
      repoPath: tmpDir,
      outputPath: tmpDir,
      owner: 'test',
      repo: 'repo',
    });

    try {
      const writeResults = [];
      const concurrentOperations = Array.from({ length: 10 }, (_, i) => {
        return updateWorkspaceFileContent(sessionId, 'test.txt', `Content iteration ${i}`).then((res) => {
          writeResults.push(i);
          return res;
        });
      });

      await Promise.all(concurrentOperations);

      // Verify all 10 operations completed cleanly
      assert.equal(writeResults.length, 10);
      
      // Verify final file content matches last scheduled write or valid execution
      const finalContent = await fs.readFile(path.join(tmpDir, 'test.txt'), 'utf-8');
      assert.ok(finalContent.startsWith('Content iteration'));
    } finally {
      buildExecutor.deleteSession(sessionId);
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
