import { defineConfig } from '@playwright/test';

const frontendUrl = 'http://127.0.0.1:4173';
const backendUrl = 'http://127.0.0.1:4002';
const hasLiveGitHubEnv = Boolean(process.env.E2E_GITHUB_TOKEN && process.env.E2E_GITHUB_REPO);
const sharedIgnoredSpecs = ['tests/e2e/ui-sanity.spec.ts'];

const backendCommand = hasLiveGitHubEnv
  ? 'FRONTEND_URL=http://127.0.0.1:4173 PORT=4002 ALLOW_TEST_SESSION_AUTH=true npm run dev --prefix backend'
  : 'ENABLE_LOCAL_TEST_MODE=true LOCAL_TEST_TOKEN=local-test LOCAL_TEST_REPO_OWNER=demo LOCAL_TEST_REPO_NAME=course-demo LOCAL_TEST_REPO_PATH=./test-repo/course-demo FRONTEND_URL=http://127.0.0.1:4173 PORT=4002 npm run dev --prefix backend';

const frontendCommand = hasLiveGitHubEnv
  ? 'VITE_BACKEND_URL=http://127.0.0.1:4002 npm run build --prefix frontend && npm run preview --prefix frontend -- --host 127.0.0.1 --port 4173'
  : 'VITE_ENABLE_LOCAL_TEST_MODE=true VITE_BACKEND_URL=http://127.0.0.1:4002 VITE_LOCAL_TEST_TOKEN=local-test VITE_LOCAL_TEST_REPO_OWNER=demo VITE_LOCAL_TEST_REPO_NAME=course-demo npm run build --prefix frontend && npm run preview --prefix frontend -- --host 127.0.0.1 --port 4173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  testIgnore: hasLiveGitHubEnv
    ? ['tests/e2e/local-demo.spec.ts', ...sharedIgnoredSpecs]
    : ['tests/e2e/github-live.spec.ts', ...sharedIgnoredSpecs],
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: backendCommand,
      url: `${backendUrl}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: frontendCommand,
      url: frontendUrl,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
