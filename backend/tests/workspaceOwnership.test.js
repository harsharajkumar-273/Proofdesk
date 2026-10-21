import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessBuildSession, checkWorkspaceOwner } from '../src/middleware/auth.ts';
import { buildExecutor } from '../src/services/buildExecutor.ts';

const req = ({ login, token } = {}) => ({
  accessToken: token,
  authSession: login ? { user: { login } } : null,
});

describe('canAccessBuildSession', () => {
  it('lets the signed-in creator in, whatever token they now hold', () => {
    assert.equal(canAccessBuildSession({ creatorLogin: 'ada', token: 'old' }, req({ login: 'ada', token: 'new' })), true);
  });

  it('refuses another signed-in user', () => {
    assert.equal(canAccessBuildSession({ creatorLogin: 'ada', token: 't1' }, req({ login: 'bob', token: 't2' })), false);
  });

  it('refuses a bare bearer token that did not create the session (the old bypass)', () => {
    assert.equal(canAccessBuildSession({ creatorLogin: 'ada', token: 't1' }, req({ token: 'someone-else' })), false);
    assert.equal(canAccessBuildSession({ creatorLogin: null, token: 't1' }, req({ token: 'someone-else' })), false);
  });

  it('lets the token that created a session in', () => {
    assert.equal(canAccessBuildSession({ creatorLogin: null, token: 't1' }, req({ token: 't1' })), true);
    assert.equal(canAccessBuildSession({ creatorLogin: 'ada', token: 't1' }, req({ token: 't1' })), true);
  });

  it('refuses when the session has neither owner nor token to compare', () => {
    assert.equal(canAccessBuildSession({ creatorLogin: null, token: null }, req({ login: 'ada', token: 't' })), false);
    assert.equal(canAccessBuildSession({ creatorLogin: null, token: '' }, req({ token: '' })), false);
  });
});

describe('checkWorkspaceOwner', () => {
  const id = 'bbbbbbbbbbbbbbb1';
  afterEach(() => buildExecutor.sessions.delete(id));

  const run = (request) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json() { return this; },
    };
    let nextCalled = false;
    checkWorkspaceOwner({ params: { sessionId: id }, ...request }, res, () => { nextCalled = true; });
    return { status: res.statusCode, nextCalled };
  };

  it('no longer waves through a request without a login', () => {
    buildExecutor.sessions.set(id, { owner: 'o', repo: 'r', repoPath: '/x', outputPath: '/y', creatorLogin: 'ada', token: 'ada-token' });
    assert.deepEqual(run(req({ token: 'stranger-token' })), { status: 403, nextCalled: false });
    assert.deepEqual(run(req({ token: 'ada-token' })), { status: 200, nextCalled: true });
    assert.deepEqual(run(req({ login: 'ada', token: 'x' })), { status: 200, nextCalled: true });
  });

  it('still answers 404 for an unknown session', () => {
    assert.deepEqual(run(req({ login: 'ada', token: 'x' })), { status: 404, nextCalled: false });
  });
});
