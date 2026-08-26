import { defineConfig } from '@playwright/test';

/**
 * Separate Playwright project for benchmarks/compile_latency.spec.ts, so
 * `npm run test:e2e` (correctness) and the compile-latency benchmark stay
 * independent — the benchmark is slow (5 real builds per mode) and prints
 * timing data rather than just pass/fail.
 *
 * Reuses the same local-test-mode backend/frontend bootstrap as
 * playwright.config.ts. Requires `docker-compose up --build -d` first so
 * the real WASM/Docker build paths are actually available to hit.
 */
const frontendUrl = 'http://127.0.0.1:4173';
const backendUrl = 'http://127.0.0.1:4002';

const backendCommand =
  'ENABLE_LOCAL_TEST_MODE=true LOCAL_TEST_TOKEN=local-test LOCAL_TEST_REPO_OWNER=demo LOCAL_TEST_REPO_NAME=course-demo LOCAL_TEST_REPO_PATH=./test-repo/course-demo FRONTEND_URL=http://127.0.0.1:4173 PORT=4002 ALLOW_TEST_SESSION_AUTH=true npm run dev --prefix backend';

const frontendCommand =
  'VITE_ENABLE_LOCAL_TEST_MODE=true VITE_BACKEND_URL=http://127.0.0.1:4002 VITE_LOCAL_TEST_TOKEN=local-test VITE_LOCAL_TEST_REPO_OWNER=demo VITE_LOCAL_TEST_REPO_NAME=course-demo npm run build --prefix frontend && npm run preview --prefix frontend -- --host 127.0.0.1 --port 4173';

export default defineConfig({
  testDir: './benchmarks',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  expect: {
    timeout: 60_000,
  },
  workers: 1,
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
