import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleAuthUrl } from '../src/services/googleIdentity.js';

describe('Google Identity OAuth Service', () => {
  it('builds Google OAuth authorization URL with correct query parameters', () => {
    const authUrl = buildGoogleAuthUrl({
      clientId: 'test-google-client-id',
      redirectUri: 'http://localhost:4000/auth/google/callback',
      state: 'test-state-12345',
    });

    const parsed = new URL(authUrl);
    assert.equal(parsed.hostname, 'accounts.google.com');
    assert.equal(parsed.pathname, '/o/oauth2/v2/auth');
    assert.equal(parsed.searchParams.get('client_id'), 'test-google-client-id');
    assert.equal(parsed.searchParams.get('redirect_uri'), 'http://localhost:4000/auth/google/callback');
    assert.equal(parsed.searchParams.get('state'), 'test-state-12345');
    assert.equal(parsed.searchParams.get('response_type'), 'code');
    assert.equal(parsed.searchParams.get('scope'), 'openid email profile');
  });
});
