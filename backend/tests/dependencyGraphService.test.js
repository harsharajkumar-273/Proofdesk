import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Setup environment before importing service
process.env.NODE_ENV = 'test';

const { buildDependencyGraph } = await import('../src/services/dependencyGraphService.js');
const { default: buildExecutor } = await import('../src/services/buildExecutor.js');

describe('Dependency Graph Service', () => {
  let tempDir;
  const mockSessionId = '1234567890abcdef';

  before(async () => {
    // Create temporary directory structure for testing files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proofdesk-graph-test-'));
    
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    // File 1: Chapter and Section 1
    const xml1 = `
      <chapter xml:id="vectors">
        <title>Vectors in Space</title>
        <p>Introduction to vectors.</p>
        <section xml:id="vector-addition">
          <title>Vector Addition</title>
          <p>Adding vectors is commutative.</p>
        </section>
      </chapter>
    `;
    await fs.writeFile(path.join(srcDir, 'vectors.xml'), xml1, 'utf-8');

    // File 2: Section 2 referencing Section 1
    const xml2 = `
      <section xml:id="matrix-mult">
        <title>Matrix Multiplication</title>
        <p>Multiplying matrices is linked to vector linear combinations.</p>
        <xref ref="vectors"/>
        <xref ref="vector-addition"/>
        <!-- Invalid link that should be filtered out -->
        <xref ref="non-existent-node"/>
      </section>
    `;
    await fs.writeFile(path.join(srcDir, 'matrices.xml'), xml2, 'utf-8');

    // Mock the session inside buildExecutor
    buildExecutor.sessions.set(mockSessionId, {
      id: mockSessionId,
      owner: 'test-owner',
      repo: 'test-repo',
      branch: 'main',
      repoPath: tempDir,
      outputPath: path.join(tempDir, 'output'),
      previewPath: null,
      creatorLogin: 'test-user',
      notifyEmail: null,
      commitHash: 'abcdef0',
    });
  });

  after(async () => {
    // Clean up temporary files and session mock
    buildExecutor.sessions.delete(mockSessionId);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('correctly compiles chapters, sections, titles, and links', async () => {
    const result = await buildDependencyGraph(mockSessionId);

    // Verify nodes
    assert.equal(result.nodes.length, 3);
    
    const nodeIds = result.nodes.map(n => n.id);
    assert.ok(nodeIds.includes('vectors'));
    assert.ok(nodeIds.includes('vector-addition'));
    assert.ok(nodeIds.includes('matrix-mult'));

    const vectorsNode = result.nodes.find(n => n.id === 'vectors');
    assert.equal(vectorsNode.label, 'Vectors in Space');
    assert.equal(vectorsNode.type, 'chapter');

    const addNode = result.nodes.find(n => n.id === 'vector-addition');
    assert.equal(addNode.label, 'Vector Addition');
    assert.equal(addNode.type, 'section');

    const multNode = result.nodes.find(n => n.id === 'matrix-mult');
    assert.equal(multNode.label, 'Matrix Multiplication');
    assert.equal(multNode.type, 'section');

    // Verify links
    assert.equal(result.links.length, 2);
    
    // Links should flow from matrix-mult to vectors, and matrix-mult to vector-addition
    const linkKeys = result.links.map(l => `${l.source}->${l.target}`);
    assert.ok(linkKeys.includes('matrix-mult->vectors'));
    assert.ok(linkKeys.includes('matrix-mult->vector-addition'));
    
    // Non-existent references should be excluded
    const invalidLinkExists = result.links.some(l => l.target === 'non-existent-node');
    assert.equal(invalidLinkExists, false);
  });
});
