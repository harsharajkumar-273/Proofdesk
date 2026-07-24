import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import request from 'supertest';
import { app } from '../src/server.js';
import buildExecutor from '../src/services/buildExecutor.js';
import authSessionStore from '../src/services/authSessionStore.js';

describe('Bearer Token Workspace Session Ownership Security (#32)', () => {
  const sessionId = '1111222233334444';
  const ownerLogin = 'alice';
  const attackerLogin = 'bob';
  let ownerSession;

  before(async () => {
    // Register workspace session owned by 'alice'
    buildExecutor.sessions.set(sessionId, {
      id: sessionId,
      owner: 'demo',
      repo: 'course-demo',
      repoPath: 'temp',
      outputPath: 'temp',
      creatorLogin: ownerLogin,
    });

    // Create auth sessions in store
    ownerSession = await authSessionStore.createSession({
      accessToken: 'owner_bearer_token_12345',
      user: { login: ownerLogin, name: 'Alice' },
    });
  });

  after(async () => {
    buildExecutor.sessions.delete(sessionId);
    if (ownerSession?.id) {
      await authSessionStore.destroySession(ownerSession.id);
    }
  });

  it('allows access to workspace owner using valid session cookie or Bearer token', async () => {
    const res = await request(app)
      .get(`/workspace/${sessionId}/git/status`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`);

    // Since mock session has valid owner, checkWorkspaceOwner allows request (or returns status/error from git execution, NOT 403 Access denied)
    assert.notEqual(res.status, 403);
  });

  it('denies access (403) to Bearer token clients with unauthenticated/unknown session when workspace is owned', async () => {
    const res = await request(app)
      .get(`/workspace/${sessionId}/git/status`)
      .set('Authorization', 'Bearer unknown_attacker_token_99999');

    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'Access denied');
  });

  it('denies access (403) to Bearer token client matching a different user (attacker)', async () => {
    const attackerSession = await authSessionStore.createSession({
      accessToken: 'attacker_token_88888',
      user: { login: attackerLogin, name: 'Bob' },
    });

    try {
      const res = await request(app)
        .get(`/workspace/${sessionId}/git/status`)
        .set('Authorization', `Bearer ${attackerSession.accessToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error, 'Access denied');
    } finally {
      await authSessionStore.destroySession(attackerSession.id);
    }
  });
});
