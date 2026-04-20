import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.ENABLE_LOCAL_TEST_MODE = 'true';
process.env.LOCAL_TEST_TOKEN = 'local-test';
process.env.LOCAL_TEST_REPO_OWNER = 'demo';
process.env.LOCAL_TEST_REPO_NAME = 'course-demo';
process.env.LOCAL_TEST_REPO_PATH = './test-repo/course-demo';

const buildExecutor = (await import('../src/services/buildExecutor.js')).default;
const localTestRepoService = (await import('../src/services/localTestRepoService.js')).default;
const {
  buildContainerTerminalInvocation,
  createTerminalEnvironment,
  getTerminalShellSpec,
  getTerminalRuntime,
  resolveTerminalWorkspace,
} = await import('../src/services/terminalServer.js');

describe('resolveTerminalWorkspace', () => {
  it('uses the seeded local repository when local test mode is active', async () => {
    const workspace = await resolveTerminalWorkspace({
      token: 'local-test',
      owner: 'demo',
      repo: 'course-demo',
      buildSessionId: null,
    });

    assert.equal(workspace.cwd, localTestRepoService.getRepoPath());
    assert.equal(workspace.repoFullName, 'demo/course-demo');
    assert.equal(workspace.buildSessionId, null);
  });

  it('prefers the existing build workspace when a build session is already open', async () => {
    const existingSessionId = '0123456789abcdef';
    buildExecutor.sessions.set(existingSessionId, {
      owner: 'demo',
      repo: 'course-demo',
      repoPath: '/tmp/mra-terminal-test',
      outputPath: '/tmp/mra-terminal-test-output',
    });

    const workspace = await resolveTerminalWorkspace({
      token: 'local-test',
      owner: 'demo',
      repo: 'course-demo',
      buildSessionId: existingSessionId,
    });

    assert.equal(workspace.cwd, '/tmp/mra-terminal-test');
    assert.equal(workspace.repoFullName, 'demo/course-demo');
    assert.equal(workspace.buildSessionId, existingSessionId);

    buildExecutor.sessions.delete(existingSessionId);
  });

  it('defaults the integrated terminal to restricted mode', () => {
    const shellSpec = getTerminalShellSpec();
    assert.equal(shellSpec.restricted, true);
  });

  it('defaults the terminal runtime to the host process in local development', () => {
    assert.equal(getTerminalRuntime(), 'process');
  });

  it('builds a minimal terminal environment without leaking backend secrets', () => {
    process.env.GITHUB_CLIENT_SECRET = 'should-not-leak';
    process.env.PROOFDESK_SESSION_SECRET = 'also-hidden';

    const env = createTerminalEnvironment({
      shell: '/bin/bash',
      homeDir: '/tmp/proofdesk-terminal-home',
      workspace: {
        cwd: '/tmp/proofdesk-workspace',
        repoFullName: 'demo/course-demo',
        buildSessionId: '1234567890abcdef',
      },
    });

    assert.equal(env.PWD, '/tmp/proofdesk-workspace');
    assert.equal(env.MRA_REPO_FULL_NAME, 'demo/course-demo');
    assert.ok(!Object.hasOwn(env, 'GITHUB_CLIENT_SECRET'));
    assert.ok(!Object.hasOwn(env, 'PROOFDESK_SESSION_SECRET'));
  });

  it('builds an isolated docker terminal invocation for deployment mode', () => {
    const invocation = buildContainerTerminalInvocation({
      shell: '/bin/bash',
      args: ['--noprofile', '--norc', '--restricted', '-i'],
      workspace: {
        cwd: '/tmp/proofdesk-workspace',
        repoFullName: 'demo/course-demo',
        buildSessionId: '1234567890abcdef',
      },
      homeDir: '/tmp/proofdesk-terminal-home',
    });

    assert.equal(invocation.command, 'docker');
    assert.ok(invocation.args.includes('--network'));
    assert.ok(invocation.args.includes('none'));
    assert.ok(invocation.args.includes('--cap-drop'));
    assert.ok(invocation.args.includes('ALL'));
    assert.ok(invocation.args.includes('mra-pretext-builder'));
  });

  it('requires a repository workspace before opening a real shell', async () => {
    await assert.rejects(
      () =>
        resolveTerminalWorkspace({
          token: 'github-token',
          owner: '',
          repo: '',
          buildSessionId: null,
        }),
      /Open a repository workspace before starting the terminal/
    );
  });
});
