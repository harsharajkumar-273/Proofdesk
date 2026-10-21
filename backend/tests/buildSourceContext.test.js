import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { collectSourceContext, findLogLocations, resolveLogPath } from '../src/services/buildSourceContext.ts';

describe('findLogLocations', () => {
  it('finds colon and worded locations in log order, without duplicates', () => {
    const log = [
      '/work/source/ch2.xml:17: parser error : Opening and ending tag mismatch',
      'lxml.etree.XMLSyntaxError: Premature end of data (ch1.xml, line 40)',
      'File "chapters/ch3.ptx", line 5',
      '/work/source/ch2.xml:17: parser error : repeated',
      'see build.py:12 and notes.txt:3',
    ].join('\n');
    assert.deepEqual(findLogLocations(log), [
      { rawPath: '/work/source/ch2.xml', line: 17 },
      { rawPath: 'ch1.xml', line: 40 },
      { rawPath: 'chapters/ch3.ptx', line: 5 },
    ]);
  });
});

describe('source context from a repository', () => {
  let repo;
  let outside;

  before(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 'pd-src-'));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'pd-out-'));
    await fs.mkdir(path.join(repo, 'source'), { recursive: true });
    const lines = Array.from({ length: 30 }, (_, i) => `<p>line ${i + 1}</p>`);
    await fs.writeFile(path.join(repo, 'source', 'ch1.xml'), lines.join('\n'));
    await fs.writeFile(path.join(outside, 'secret.xml'), 'TOP SECRET\n'.repeat(5));
    await fs.symlink(outside, path.join(repo, 'escape'));
  });

  after(async () => {
    await fs.rm(repo, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  it('maps container and relative paths onto repository files', async () => {
    assert.equal(await resolveLogPath(repo, '/home/runner/build/source/ch1.xml'), 'source/ch1.xml');
    assert.equal(await resolveLogPath(repo, 'ch1.xml'), null);
    assert.equal(await resolveLogPath(repo, 'source/missing.xml'), null);
  });

  it('refuses traversal and symlinks that leave the repository', async () => {
    assert.equal(await resolveLogPath(repo, '../../etc/passwd.xml'), null);
    assert.equal(await resolveLogPath(repo, 'escape/secret.xml'), null);
    const snippets = await collectSourceContext(repo, 'escape/secret.xml:2: error');
    assert.deepEqual(snippets, []);
  });

  it('returns numbered lines around the reported line with the line marked', async () => {
    const [snippet] = await collectSourceContext(repo, '/build/source/ch1.xml:10: parser error');
    assert.equal(snippet.path, 'source/ch1.xml');
    assert.equal(snippet.line, 10);
    const lines = snippet.text.split('\n');
    assert.equal(lines.length, 13);
    assert.match(lines[0], /^ {3}4 \| <p>line 4<\/p>$/);
    assert.match(lines[6], /^> 10 \| <p>line 10<\/p>$/);
  });

  it('skips lines past the end of the file, nearby duplicates, and caps the number of snippets', async () => {
    const log = [
      'source/ch1.xml:99: error',
      'source/ch1.xml:2: error',
      'source/ch1.xml:3: error',
      'source/ch1.xml:12: error',
      'source/ch1.xml:20: error',
      'source/ch1.xml:28: error',
    ].join('\n');
    const snippets = await collectSourceContext(repo, log);
    assert.deepEqual(snippets.map((s) => s.line), [2, 12, 20]);
  });

  it('returns nothing without a repository', async () => {
    assert.deepEqual(await collectSourceContext(undefined, 'source/ch1.xml:2: error'), []);
  });
});
