import { defineConfig, devices } from '@playwright/test';

const frontendUrl = 'http://127.0.0.1:4173';
const backendUrl = 'http://127.0.0.1:4002';

const backendCommand = 'ENABLE_LOCAL_TEST_MODE=true LOCAL_TEST_TOKEN=local-test LOCAL_TEST_REPO_OWNER=demo LOCAL_TEST_REPO_NAME=course-demo LOCAL_TEST_REPO_PATH=./test-repo/course-demo FRONTEND_URL=http://127.0.0.1:4173 PORT=4002 npm run dev --prefix backend';
const frontendCommand = 'VITE_ENABLE_LOCAL_TEST_MODE=true VITE_BACKEND_URL=http://127.0.0.1:4002 VITE_LOCAL_TEST_TOKEN=local-test VITE_LOCAL_TEST_REPO_OWNER=demo VITE_LOCAL_TEST_REPO_NAME=course-demo npm run build --prefix frontend && npm run preview --prefix frontend -- --host 127.0.0.1 --port 4173';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /ui-sanity\.spec\.ts/,
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
      },
    },
    {
      name: 'tablet-width',
      use: {
        ...devices['iPad Mini'],
      },
    },
  ],
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
