import fs from 'fs';
import { getDefaultProofdeskDataRoot, getProofdeskDataRoot } from './dataPaths.js';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const PLACEHOLDER_VALUES = new Set([
  'replace_me',
  'changeme',
  'change_me',
  'your_client_id',
  'your_client_secret',
  'your_redirect_uri',
]);

const toBoolean = (value) =>
  TRUE_VALUES.has(String(value || '').trim().toLowerCase());

const hasValue = (value) => typeof value === 'string' && value.trim().length > 0;
const isPlaceholderValue = (value) => PLACEHOLDER_VALUES.has(String(value || '').trim().toLowerCase());
export const hasConfiguredValue = (value) => hasValue(value) && !isPlaceholderValue(value);

const isAbsoluteHttpUrl = (value) => /^https?:\/\//i.test(String(value || ''));

const isLocalHttpUrl = (value) =>
  /^https?:\/\/(?:localhost|127(?:\.\d+){3})(?::\d+)?(?:\/|$)/i.test(String(value || ''));

const countCsvEntries = (value) =>
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean).length;

const issue = (code, message) => ({ code, message });

export const getRuntimeConfig = (env = process.env) => {
  const frontendUrl = env.FRONTEND_URL || '';
  const githubRedirectUri = hasConfiguredValue(env.GITHUB_REDIRECT_URI) ? env.GITHUB_REDIRECT_URI : '';
  const localTestModeEnabled = toBoolean(env.ENABLE_LOCAL_TEST_MODE);
  const dockerSocketAvailable = fs.existsSync(DOCKER_SOCKET_PATH);
  const configuredDataRoot = getProofdeskDataRoot(env);
  const explicitDataRoot = typeof env.PROOFDESK_DATA_DIR === 'string' ? env.PROOFDESK_DATA_DIR.trim() : '';
  const sessionSecretConfigured = hasConfiguredValue(env.PROOFDESK_SESSION_SECRET || env.SESSION_ENCRYPTION_SECRET);
  const terminalMode = String(env.PROOFDESK_TERMINAL_MODE || 'restricted').trim().toLowerCase() === 'full'
    ? 'full'
    : 'restricted';
  const terminalRuntime = String(env.PROOFDESK_TERMINAL_RUNTIME || 'process').trim().toLowerCase() === 'container'
    ? 'container'
    : 'process';
  const sharedStateBackend = String(env.PROOFDESK_SHARED_STATE_BACKEND || 'filesystem').trim().toLowerCase() === 'redis'
    ? 'redis'
    : 'filesystem';
  const redisUrlConfigured = hasConfiguredValue(env.PROOFDESK_REDIS_URL);

  return {
    nodeEnv: env.NODE_ENV || 'development',
    port: Number(env.PORT || 4000),
    frontendUrl,
    githubRedirectUri,
    githubClientIdConfigured: hasConfiguredValue(env.GITHUB_CLIENT_ID),
    githubClientSecretConfigured: hasConfiguredValue(env.GITHUB_CLIENT_SECRET),
    githubRedirectUriConfigured: hasConfiguredValue(githubRedirectUri),
    sessionSecretConfigured,
    localTestModeEnabled,
    prewarmRepoCount: countCsvEntries(env.PREWARM_REPOS),
    shellPath: env.SHELL || '',
    dockerSocketAvailable,
    proofdeskDataRoot: configuredDataRoot,
    proofdeskDataRootExplicit: explicitDataRoot.length > 0,
    terminalMode,
    terminalRuntime,
    sharedStateBackend,
    redisUrlConfigured,
  };
};

export const validateRuntimeConfig = (env = process.env, options = {}) => {
  const config = getRuntimeConfig(env);
  // Strict mode: enforced in production, opt-in via PROOFDESK_STRICT_CONFIG=true,
  // opt-out via PROOFDESK_STRICT_CONFIG=false (useful for staging environments).
  const strictEnvOverride = hasConfiguredValue(env.PROOFDESK_STRICT_CONFIG)
    ? toBoolean(env.PROOFDESK_STRICT_CONFIG)
    : null;
  const strict = strictEnvOverride !== null
    ? strictEnvOverride
    : (options.strict === true || config.nodeEnv === 'production');
  const errors = [];
  const warnings = [];

  const githubOauthConfigured =
    config.githubClientIdConfigured
    && config.githubClientSecretConfigured
    && config.githubRedirectUriConfigured;
  const githubCredentialPairStarted =
    config.githubClientIdConfigured
    || config.githubClientSecretConfigured;
  const githubOauthPartiallyConfigured =
    githubCredentialPairStarted && !githubOauthConfigured;

  if (!config.frontendUrl) {
    (strict ? errors : warnings).push(
      issue(
        'frontend_url_missing',
        strict
          ? 'FRONTEND_URL must be set so OAuth callbacks and repository links resolve to the deployed frontend.'
          : 'FRONTEND_URL is not set. Development will fall back to http://localhost:3000.'
      )
    );
  } else if (!isAbsoluteHttpUrl(config.frontendUrl)) {
    errors.push(issue('frontend_url_invalid', 'FRONTEND_URL must be an absolute http(s) URL.'));
  } else if (isLocalHttpUrl(config.frontendUrl)) {
    (strict ? errors : warnings).push(
      issue(
        'frontend_url_local',
        strict
          ? 'FRONTEND_URL cannot point to localhost in a deployment-grade environment.'
          : 'FRONTEND_URL is using localhost, which is fine for local development but not for public deployment.'
      )
    );
  }

  if (githubOauthPartiallyConfigured && !githubOauthConfigured) {
    errors.push(
      issue(
        'github_oauth_incomplete',
        'GitHub OAuth is only partially configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_REDIRECT_URI together.'
      )
    );
  }

  if (!githubOauthConfigured && !config.localTestModeEnabled) {
    errors.push(
      issue(
        'auth_unavailable',
        'Neither GitHub OAuth nor local test mode is enabled. Users will not be able to enter the workspace.'
      )
    );
  }

  if (githubOauthConfigured && !config.sessionSecretConfigured) {
    (strict ? errors : warnings).push(
      issue(
        'session_secret_missing',
        strict
          ? 'Set PROOFDESK_SESSION_SECRET so GitHub access tokens are encrypted at rest in the session store.'
          : 'PROOFDESK_SESSION_SECRET is not set. Proofdesk will avoid persisting reusable GitHub sessions across restarts.'
      )
    );
  }

  if (config.githubRedirectUri) {
    if (!isAbsoluteHttpUrl(config.githubRedirectUri)) {
      errors.push(issue('github_redirect_uri_invalid', 'GITHUB_REDIRECT_URI must be an absolute http(s) URL.'));
    } else if (isLocalHttpUrl(config.githubRedirectUri)) {
      (strict ? errors : warnings).push(
        issue(
          'github_redirect_uri_local',
          strict
            ? 'GITHUB_REDIRECT_URI cannot point to localhost in a deployment-grade environment.'
            : 'GITHUB_REDIRECT_URI is using localhost, which is fine for local development but not for public deployment.'
        )
      );
    }
  }

  if (config.nodeEnv === 'production' && config.localTestModeEnabled) {
    errors.push(
      issue(
        'local_test_mode_enabled',
        'ENABLE_LOCAL_TEST_MODE should be disabled in production so only real repository access is exposed.'
      )
    );
  }

  if (strict && !config.proofdeskDataRootExplicit) {
    errors.push(
      issue(
        'data_root_ephemeral',
        `Set PROOFDESK_DATA_DIR to persistent storage instead of the default ${getDefaultProofdeskDataRoot()}.`
      )
    );
  }

  if (config.terminalMode !== 'restricted') {
    (strict ? errors : warnings).push(
      issue(
        'terminal_unrestricted',
        strict
          ? 'PROOFDESK_TERMINAL_MODE must remain "restricted" in production deployments.'
          : 'The integrated terminal is running in full shell mode. Use restricted mode for safer professor-facing deployments.'
      )
    );
  }

  if (strict && config.terminalRuntime !== 'container') {
    errors.push(
      issue(
        'terminal_runtime_unisolated',
        'Set PROOFDESK_TERMINAL_RUNTIME=container so the integrated terminal runs in an isolated container during deployment.'
      )
    );
  }

  if (config.sharedStateBackend === 'redis' && !config.redisUrlConfigured) {
    errors.push(
      issue(
        'redis_url_missing',
        'Set PROOFDESK_REDIS_URL when PROOFDESK_SHARED_STATE_BACKEND=redis.'
      )
    );
  }

  if (strict && config.sharedStateBackend !== 'redis') {
    errors.push(
      issue(
        'shared_state_single_node',
        'Set PROOFDESK_SHARED_STATE_BACKEND=redis so collaboration and invite codes work across multiple deployed instances.'
      )
    );
  }

  if (!config.dockerSocketAvailable) {
    (strict ? errors : warnings).push(
      issue(
        'docker_socket_unavailable',
        strict
          ? 'Docker is not reachable at /var/run/docker.sock, so preview builds will fail after deployment.'
          : 'Docker is not reachable at /var/run/docker.sock. Preview builds may fail until Docker is available.'
      )
    );
  }

  if (!githubOauthConfigured && config.localTestModeEnabled) {
    warnings.push(
      issue(
        'oauth_disabled',
        'GitHub OAuth is disabled, so only the local demo workspace will be available until OAuth credentials are configured.'
      )
    );
  }

  if (config.prewarmRepoCount === 0) {
    warnings.push(
      issue(
        'prewarm_empty',
        'PREWARM_REPOS is empty. The first repository build after deployment may take longer than usual.'
      )
    );
  }

  return {
    config: {
      ...config,
      githubOauthConfigured,
    },
    errors,
    warnings,
    ready: errors.length === 0,
  };
};

export const formatRuntimeValidation = (validation) => {
  const lines = [];

  if (validation.errors.length > 0) {
    lines.push('Errors:');
    for (const entry of validation.errors) {
      lines.push(`- ${entry.message}`);
    }
  }

  if (validation.warnings.length > 0) {
    lines.push('Warnings:');
    for (const entry of validation.warnings) {
      lines.push(`- ${entry.message}`);
    }
  }

  if (lines.length === 0) {
    lines.push('No runtime configuration issues detected.');
  }

  return lines.join('\n');
};

export const getReadinessPayload = (env = process.env, options = {}) => {
  const validation = validateRuntimeConfig(env, options);

  return {
    status: validation.ready ? 'READY' : 'DEGRADED',
    ready: validation.ready,
    mode: validation.config.nodeEnv,
    config: {
      port: validation.config.port,
      frontendUrl: validation.config.frontendUrl || 'http://localhost:3000',
      githubOauthConfigured: validation.config.githubOauthConfigured,
      sessionSecretConfigured: validation.config.sessionSecretConfigured,
      localTestModeEnabled: validation.config.localTestModeEnabled,
      prewarmRepoCount: validation.config.prewarmRepoCount,
      dockerSocketAvailable: validation.config.dockerSocketAvailable,
      proofdeskDataRoot: validation.config.proofdeskDataRoot,
      terminalMode: validation.config.terminalMode,
    },
    errors: validation.errors,
    warnings: validation.warnings,
  };
};
