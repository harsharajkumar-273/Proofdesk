import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntimeConfig } from '../src/utils/runtimeConfig.js';

describe('runtime configuration validation', () => {
  it('accepts local demo mode for development verification', () => {
    const validation = validateRuntimeConfig({
      NODE_ENV: 'development',
      FRONTEND_URL: 'http://localhost:3000',
      ENABLE_LOCAL_TEST_MODE: 'true',
      LOCAL_TEST_TOKEN: 'local-test',
    });

    assert.equal(validation.ready, true);
    assert.equal(validation.config.localTestModeEnabled, true);
    assert.equal(validation.config.githubOauthConfigured, false);
    assert.ok(validation.warnings.some((entry) => entry.code === 'oauth_disabled'));
  });

  it('rejects production deployments that still point at localhost', () => {
    const validation = validateRuntimeConfig({
      NODE_ENV: 'production',
      FRONTEND_URL: 'http://localhost:3000',
      GITHUB_CLIENT_ID: 'abc',
      GITHUB_CLIENT_SECRET: 'def',
      GITHUB_REDIRECT_URI: 'http://localhost:4000/auth/github/callback',
    });

    assert.equal(validation.ready, false);
    assert.ok(validation.errors.some((entry) => entry.code === 'frontend_url_local'));
    assert.ok(validation.errors.some((entry) => entry.code === 'github_redirect_uri_local'));
  });

  it('treats placeholder GitHub OAuth values as not configured', () => {
    const validation = validateRuntimeConfig({
      NODE_ENV: 'development',
      FRONTEND_URL: 'http://localhost:3000',
      ENABLE_LOCAL_TEST_MODE: 'true',
      GITHUB_CLIENT_ID: 'replace_me',
      GITHUB_CLIENT_SECRET: 'replace_me',
      GITHUB_REDIRECT_URI: 'replace_me',
    });

    assert.equal(validation.ready, true);
    assert.equal(validation.config.githubOauthConfigured, false);
    assert.ok(validation.warnings.some((entry) => entry.code === 'oauth_disabled'));
  });

  it('warns in development when the session secret is missing', () => {
    const validation = validateRuntimeConfig({
      NODE_ENV: 'development',
      FRONTEND_URL: 'http://localhost:3000',
      GITHUB_CLIENT_ID: 'abc',
      GITHUB_CLIENT_SECRET: 'def',
      GITHUB_REDIRECT_URI: 'http://localhost:4000/auth/github/callback',
    });

    assert.equal(validation.ready, true);
    assert.ok(validation.warnings.some((entry) => entry.code === 'session_secret_missing'));
  });

  it('rejects production deployments without a persistent data root', () => {
    const validation = validateRuntimeConfig({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://proofdesk.example',
      GITHUB_CLIENT_ID: 'abc',
      GITHUB_CLIENT_SECRET: 'def',
      GITHUB_REDIRECT_URI: 'https://proofdesk.example/auth/github/callback',
      PROOFDESK_SESSION_SECRET: 'session-secret',
    });

    assert.equal(validation.ready, false);
    assert.ok(validation.errors.some((entry) => entry.code === 'data_root_ephemeral'));
  });

  it('rejects unrestricted terminals in production mode', () => {
    const validation = validateRuntimeConfig({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://proofdesk.example',
      GITHUB_CLIENT_ID: 'abc',
      GITHUB_CLIENT_SECRET: 'def',
      GITHUB_REDIRECT_URI: 'https://proofdesk.example/auth/github/callback',
      PROOFDESK_SESSION_SECRET: 'session-secret',
      PROOFDESK_DATA_DIR: '/var/lib/proofdesk',
      PROOFDESK_TERMINAL_MODE: 'full',
    });

    assert.equal(validation.ready, false);
    assert.ok(validation.errors.some((entry) => entry.code === 'terminal_unrestricted'));
  });

  it('rejects process-backed terminals in production mode', () => {
    const validation = validateRuntimeConfig({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://proofdesk.example',
      GITHUB_CLIENT_ID: 'abc',
      GITHUB_CLIENT_SECRET: 'def',
      GITHUB_REDIRECT_URI: 'https://proofdesk.example/auth/github/callback',
      PROOFDESK_SESSION_SECRET: 'session-secret',
      PROOFDESK_DATA_DIR: '/var/lib/proofdesk',
      PROOFDESK_TERMINAL_MODE: 'restricted',
      PROOFDESK_TERMINAL_RUNTIME: 'process',
      PROOFDESK_SHARED_STATE_BACKEND: 'redis',
      PROOFDESK_REDIS_URL: 'redis://127.0.0.1:6379',
    });

    assert.equal(validation.ready, false);
    assert.ok(validation.errors.some((entry) => entry.code === 'terminal_runtime_unisolated'));
  });

  it('rejects single-node collaboration in production mode', () => {
    const validation = validateRuntimeConfig({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://proofdesk.example',
      GITHUB_CLIENT_ID: 'abc',
      GITHUB_CLIENT_SECRET: 'def',
      GITHUB_REDIRECT_URI: 'https://proofdesk.example/auth/github/callback',
      PROOFDESK_SESSION_SECRET: 'session-secret',
      PROOFDESK_DATA_DIR: '/var/lib/proofdesk',
      PROOFDESK_TERMINAL_MODE: 'restricted',
      PROOFDESK_TERMINAL_RUNTIME: 'container',
      PROOFDESK_SHARED_STATE_BACKEND: 'filesystem',
    });

    assert.equal(validation.ready, false);
    assert.ok(validation.errors.some((entry) => entry.code === 'shared_state_single_node'));
  });

  it('requires a Redis URL when the shared-state backend is redis', () => {
    const validation = validateRuntimeConfig({
      NODE_ENV: 'development',
      FRONTEND_URL: 'http://localhost:3000',
      ENABLE_LOCAL_TEST_MODE: 'true',
      PROOFDESK_SHARED_STATE_BACKEND: 'redis',
    });

    assert.equal(validation.ready, false);
    assert.ok(validation.errors.some((entry) => entry.code === 'redis_url_missing'));
  });
});
