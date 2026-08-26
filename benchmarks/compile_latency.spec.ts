import { expect, test } from '@playwright/test';

/**
 * Real compile-latency benchmark for Proofdesk's two build paths:
 *   - In-browser Pyodide WASM compile ("Fast Preview")
 *   - Server-side Docker/BullMQ compile ("Full PDF Build" sandbox mode)
 *
 * This reuses the exact same test hooks as tests/e2e/local-demo.spec.ts
 * (local-test-mode auth, the seeded demo/course-demo repo, and the real
 * "WASM Sandbox" / "docker" mode selector in the editor UI) so it measures
 * the real build pipeline end-to-end through the browser, not a mocked one.
 *
 * Requires the full stack running locally, e.g.:
 *   docker-compose up --build -d      # ila-live builder + redis
 *   npx playwright test -c playwright.benchmark.config.ts
 *
 * Prints p50/p95/avg latency per mode to stdout. Paste the output into
 * README.md's performance section once you've run it for real, the same
 * way PulseStream's benchmarks/load_test.js results were committed.
 */

const RUNS_PER_MODE = 5;

const demoRepo = {
  owner: 'demo',
  name: 'course-demo',
  fullName: 'demo/course-demo',
  defaultBranch: 'main',
};

const enableEditorTestMode = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & { __MRA_TEST__?: boolean };
    testWindow.__MRA_TEST__ = true;
    window.localStorage.setItem('proofdesk_tour_v1', '1');
  });
};

const waitForWorkspaceFiles = async (
  page: import('@playwright/test').Page,
  expectedPaths: string[] = ['course.xml', 'interactive.js']
) => {
  await expect.poll(async () => (
    page.evaluate(() => {
      const testWindow = window as Window & {
        __mraWorkspaceSnapshot?: { loading: boolean; repoFullName: string | null; filePaths: string[] };
      };
      return testWindow.__mraWorkspaceSnapshot || null;
    })
  ), { timeout: 45_000 }).not.toBeNull();

  await expect.poll(async () => (
    page.evaluate(() => {
      const testWindow = window as Window & {
        __mraWorkspaceSnapshot?: { loading: boolean; repoFullName: string | null; filePaths: string[] };
      };
      return testWindow.__mraWorkspaceSnapshot?.loading ?? true;
    })
  ), { timeout: 45_000 }).toBe(false);

  for (const path of expectedPaths) {
    await expect.poll(async () => (
      page.evaluate((targetPath) => {
        const testWindow = window as Window & { __mraWorkspaceSnapshot?: { filePaths: string[] } };
        return testWindow.__mraWorkspaceSnapshot?.filePaths.includes(targetPath) ?? false;
      }, path)
    ), { timeout: 45_000 }).toBe(true);
  }
};

const openLocalDemoWorkspace = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.getByTestId('local-demo-login').click();
  await expect(
    page.getByRole('navigation').getByRole('link', { name: /open workspace/i })
  ).toBeVisible({ timeout: 30_000 });
  await page.goto('/workspace');
  await expect(page.getByTestId('open-demo-workspace')).toBeVisible();
  await Promise.all([
    page.waitForURL('**/editor'),
    page.getByTestId('open-demo-workspace').click(),
  ]);
  await expect.poll(() => page.url()).toContain('/editor');
  await expect(page.getByTestId('build-repository-button')).toBeVisible({ timeout: 30_000 });
  await waitForWorkspaceFiles(page);
};

const waitForEditorTestHook = async (page: import('@playwright/test').Page) => {
  await expect.poll(async () => (
    page.evaluate(() => {
      const testWindow = window as Window & {
        __mraSetActiveEditorValue?: (value: string) => void;
        __mraIsActiveEditorReady?: boolean;
      };
      return typeof testWindow.__mraSetActiveEditorValue === 'function'
        && testWindow.__mraIsActiveEditorReady === true;
    })
  ), { timeout: 45_000 }).toBe(true);
};

function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return NaN;
  const idx = Math.min(sortedMs.length - 1, Math.ceil((p / 100) * sortedMs.length) - 1);
  return sortedMs[Math.max(0, idx)];
}

function summarize(label: string, samplesMs: number[]) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    label,
    runs: sorted.length,
    samplesMs: sorted,
    avgMs: Math.round(avg * 100) / 100,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
  };
}

/**
 * One build-and-time cycle: nudges interactive.js so the build isn't served
 * from cache, clicks Build Preview, and times until the preview iframe
 * actually renders new content.
 */
const buildOnceAndTime = async (
  page: import('@playwright/test').Page,
  runIndex: number
): Promise<number> => {
  await page.locator('[data-file-path="interactive.js"]').click();
  await waitForEditorTestHook(page);

  const marker = `bench-run-${runIndex}-${Date.now()}`;
  await page.evaluate((markerText) => {
    const nextValue = `
const badge = document.getElementById('demo-badge');
if (badge) {
  badge.textContent = '${markerText}';
}
`;
    const testWindow = window as Window & { __mraSetActiveEditorValue?: (value: string) => void };
    testWindow.__mraSetActiveEditorValue?.(nextValue);
  }, marker);

  const start = Date.now();
  await page.getByRole('button', { name: /build preview|building/i }).first().click();

  const previewFrame = page.frameLocator('iframe[title="Build Preview"]');
  await expect(previewFrame.getByText(marker)).toBeVisible({ timeout: 60_000 });
  const elapsed = Date.now() - start;

  return elapsed;
};

test('WASM compile latency (Pyodide, in-browser)', async ({ page }) => {
  test.setTimeout(RUNS_PER_MODE * 70_000);
  await enableEditorTestMode(page);
  await openLocalDemoWorkspace(page);
  await page.locator('select[title*="WASM Sandbox"]').selectOption('wasm');

  const samples: number[] = [];
  for (let i = 0; i < RUNS_PER_MODE; i++) {
    samples.push(await buildOnceAndTime(page, i));
  }

  const result = summarize('wasm', samples);
  console.log('\n=== Proofdesk compile latency: WASM (in-browser Pyodide) ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('===============================================================\n');

  expect(samples.length).toBe(RUNS_PER_MODE);
});

test('Docker/BullMQ compile latency (server-side sandbox)', async ({ page }) => {
  test.setTimeout(RUNS_PER_MODE * 70_000);
  await enableEditorTestMode(page);
  await openLocalDemoWorkspace(page);
  await page.locator('select[title*="WASM Sandbox"]').selectOption('docker');

  const samples: number[] = [];
  for (let i = 0; i < RUNS_PER_MODE; i++) {
    samples.push(await buildOnceAndTime(page, i));
  }

  const result = summarize('docker', samples);
  console.log('\n=== Proofdesk compile latency: Docker (server-side BullMQ worker) ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('=======================================================================\n');

  expect(samples.length).toBe(RUNS_PER_MODE);
});
