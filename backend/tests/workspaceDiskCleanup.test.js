import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getProofdeskDataRoot } from '../src/utils/dataPaths.js';
import workspaceRepository from '../src/repositories/workspace.repository.js';
import buildExecutor from '../src/services/buildExecutor.js';

describe('Physical Workspace Directory & Stale Disk Cleanup (#7)', () => {
  const activeSessionId = '0000111122223333';
  const staleSessionId = '9999888877776666';

  const dataRoot = getProofdeskDataRoot();
  const activeDir = path.join(dataRoot, activeSessionId);
  const staleDir = path.join(dataRoot, staleSessionId);

  before(async () => {
    // Create physical workspace directories for testing
    await fs.mkdir(activeDir, { recursive: true });
    await fs.mkdir(staleDir, { recursive: true });

    await fs.writeFile(path.join(activeDir, 'file.txt'), 'active session data');
    await fs.writeFile(path.join(staleDir, 'file.txt'), 'stale session data');

    // Register active session in database
    await workspaceRepository.saveSession({
      id: activeSessionId,
      owner: 'test',
      repo: 'test-repo',
      branch: 'main',
      repoPath: path.join(activeDir, 'repo'),
      outputPath: path.join(activeDir, 'output'),
    });
  });

  after(async () => {
    try {
      await fs.rm(activeDir, { recursive: true, force: true });
      await fs.rm(staleDir, { recursive: true, force: true });
    } catch {}
  });

  it('scans and removes stale directories not present in database via runGlobalCleanup', async () => {
    let staleExists = false;
    try {
      await fs.access(staleDir);
      staleExists = true;
    } catch {}
    assert.equal(staleExists, true);

    const { deletedDirs } = await buildExecutor.runGlobalCleanup();
    assert.ok(deletedDirs.includes(staleDir));

    let staleExistsAfter = false;
    try {
      await fs.access(staleDir);
      staleExistsAfter = true;
    } catch {}
    assert.equal(staleExistsAfter, false);

    // Ensure active directory was preserved
    let activeExists = false;
    try {
      await fs.access(activeDir);
      activeExists = true;
    } catch {}
    assert.equal(activeExists, true);
  });

  it('physically deletes workspace directory from disk upon session deletion from database', async () => {
    // Perform session deletion
    await workspaceRepository.deleteSession(activeSessionId);

    // Verify directory is deleted from disk
    let activeExistsAfter = false;
    try {
      await fs.access(activeDir);
      activeExistsAfter = true;
    } catch {}
    assert.equal(activeExistsAfter, false);
  });
});
