import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Runs docker/build.sh's npm_install_if_changed against a fake `npm` that counts calls.
const buildSh = fs.readFileSync(new URL('../../docker/build.sh', import.meta.url), 'utf-8');
const fn = buildSh.match(/^npm_install_if_changed\(\) \{[\s\S]*?^\}/m)?.[0];

describe('build.sh npm_install_if_changed', () => {
  it('runs npm install only when package.json changed', () => {
    assert.ok(fn, 'function not found in build.sh');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-stamp-'));
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'bin', 'npm'), `#!/bin/sh\necho x >> "${dir}/calls"\nmkdir -p node_modules\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"a"}');
    const run = () => execFileSync('bash', ['-c', `${fn}\nnpm_install_if_changed`], {
      cwd: dir, env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}` },
    });
    const calls = () => fs.readFileSync(path.join(dir, 'calls'), 'utf-8').trim().split('\n').length;

    run(); assert.equal(calls(), 1);
    run(); assert.equal(calls(), 1, 'unchanged package.json must skip install');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"b"}');
    run(); assert.equal(calls(), 2, 'changed package.json must reinstall');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
