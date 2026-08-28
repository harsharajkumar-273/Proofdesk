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
 * The two paths are exercised differently because the app's compileRepository
 * only takes the WASM branch for an actual PreTeXt file (course.xml) - the
 * WASM test edits that, click-to-build, no priming needed (the WASM path
 * reads the live editor buffer directly). The Docker/BullMQ test edits
 * interactive.js instead, which never takes the WASM branch regardless of
 * engine selection, and needs one unmeasured priming build first to put the
 * app in the mode where editing debounce-syncs to the server at all - see
 * primeRepositoryBuildMode's comment for why.
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
 * Clicking "Build Preview" is what flips EditorPage's compilationMode to
 * 'repository' (initializeBuildSession -> setCompilationModeState) -
 * that's the ONLY thing that switches it, and it's a precondition, not a
 * side effect of editing. Opening a non-PreTeXt file (interactive.js) for
 * the first time sets mode to 'file' instead (openFileInTab), and
 * applyEditorValueChange's debounced auto-rebuild - the only path that
 * ever POSTs edited content to /build/update - hard-returns for any mode
 * other than 'repository'. So editing-then-clicking-build (the original
 * shape of this helper) builds for real, but from whatever content the
 * server already had: the click carries no content of its own, and the
 * edit's sync got skipped because mode was still 'file' when it fired.
 * The result: a real, successful build of stale content, silently never
 * containing the marker - a hang, not a slow build.
 *
 * The working sequence (matches tests/e2e/local-demo.spec.ts's "updates
 * the preview in live-edit mode" test, which this mirrors) is build FIRST
 * to establish repository mode, THEN edit and let the debounce sync it.
 */
const primeRepositoryBuildMode = async (page: import('@playwright/test').Page) => {
  await page.locator('[data-file-path="interactive.js"]').click();
  await waitForEditorTestHook(page);
  await page.getByRole('button', { name: /build preview|building/i }).first().click();
  await expect(page.locator('iframe[title="Build Preview"]')).toBeVisible({ timeout: 150_000 });
};

/**
 * One edit-and-time cycle for the Docker/BullMQ path: nudges
 * interactive.js's content (repository mode must already be primed - see
 * primeRepositoryBuildMode) and times until the debounced auto-rebuild
 * lands the new content in the preview iframe. This is a real user-facing
 * latency (edit -> updated preview), just not one gated behind a second
 * manual build click - the app only asks for that click once, to open the
 * file for editing.
 *
 * interactive.js is not a PreTeXt file (isPretextXmlFile in
 * EditorPage.tsx's compileRepository/runQueuedRebuild checks .xml/.ptx),
 * so this always takes the server build path regardless of which engine
 * is selected - which is exactly why it's only used for the Docker test.
 * See buildXmlOnceAndTime for the WASM path, which needs an actual
 * PreTeXt file to ever take the WASM branch.
 */
const buildOnceAndTime = async (
  page: import('@playwright/test').Page,
  runIndex: number
): Promise<number> => {
  const marker = `bench-run-${runIndex}-${Date.now()}`;
  const start = Date.now();
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

  // The docker/ image's pretex-cache and vagrant-build named volumes cache
  // LaTeX-to-SVG equation renders and compiled JS/CSS bundles across builds
  // (see docker-compose.yml) - by far the biggest factor in build time.
  // Freshly created volumes (first-ever `docker-compose up`, or after a
  // `docker volume prune`) start empty, so run 0 pays for a real cold
  // compile and can take well over a minute; runs 1+ hit the now-warm cache
  // and are much faster. Give run 0 real headroom; keep later runs tighter
  // so a genuine hang still fails fast.
  const previewFrame = page.frameLocator('iframe[title="Build Preview"]');
  await expect(previewFrame.getByText(marker)).toBeVisible({
    timeout: runIndex === 0 ? 150_000 : 60_000,
  });
  const elapsed = Date.now() - start;

  return elapsed;
};

/**
 * One edit-and-time cycle for the real in-browser WASM path. Unlike
 * interactive.js, course.xml IS a PreTeXt file, so compileRepository's
 * WASM branch (compilerRuntime === 'wasm' && isPretextXmlFile(path))
 * actually triggers - it reads tabs.find(activeTabId).content directly,
 * no server round-trip, so edit-then-click (no priming needed) is the
 * correct order here, unlike the Docker/interactive.js path above.
 */
const buildXmlOnceAndTime = async (
  page: import('@playwright/test').Page,
  runIndex: number
): Promise<number> => {
  await page.locator('[data-file-path="course.xml"]').click();
  await waitForEditorTestHook(page);

  const marker = `bench-run-${runIndex}-${Date.now()}`;
  await page.evaluate((markerText) => {
    const nextValue = `<course title="Linear Algebra Demo" subtitle="A seeded repository for local product testing">
  <section title="Vectors">
    <paragraph>${markerText}</paragraph>
    <paragraph>Edit this XML file to test full preview rebuilds without GitHub.</paragraph>
    <item>Represent vectors as ordered lists of numbers.</item>
    <item>Use the preview to confirm text updates appear after rebuild.</item>
  </section>
  <section title="Matrices">
    <paragraph>Matrices organize coefficients so we can describe systems and transformations.</paragraph>
    <item>Use styles.css to test quick asset updates.</item>
    <item>Use interactive.js to test JavaScript live preview updates.</item>
  </section>
</course>`;
    const testWindow = window as Window & { __mraSetActiveEditorValue?: (value: string) => void };
    testWindow.__mraSetActiveEditorValue?.(nextValue);
  }, marker);

  const start = Date.now();
  await page.getByRole('button', { name: /build preview|building/i }).first().click();

  const previewFrame = page.frameLocator('iframe[title="Build Preview"]');
  await expect(previewFrame.getByText(marker)).toBeVisible({
    timeout: runIndex === 0 ? 150_000 : 60_000,
  });
  const elapsed = Date.now() - start;

  return elapsed;
};

test('WASM compile latency (Pyodide, in-browser)', async ({ page }) => {
  // Run 0's own expect() above budgets up to 150s (cold cache); runs 1+
  // budget 70s each. Add 30s of headroom for workspace setup/navigation.
  test.setTimeout(150_000 + (RUNS_PER_MODE - 1) * 70_000 + 30_000);
  await enableEditorTestMode(page);
  await openLocalDemoWorkspace(page);
  await page.locator('select[title*="WASM Sandbox"]').selectOption('wasm');

  const samples: number[] = [];
  for (let i = 0; i < RUNS_PER_MODE; i++) {
    samples.push(await buildXmlOnceAndTime(page, i));
  }

  const result = summarize('wasm', samples);
  console.log('\n=== Proofdesk compile latency: WASM (in-browser Pyodide) ===');
  console.log(JSON.stringify(result, null, 2));
  console.log('===============================================================\n');

  expect(samples.length).toBe(RUNS_PER_MODE);
});

test('Docker/BullMQ compile latency (server-side sandbox)', async ({ page }) => {
  // primeRepositoryBuildMode's own build budgets up to 150s (cold cache);
  // run 0's edit-and-wait budgets another 150s (still-cold cache for the
  // first debounced rebuild); runs 1+ budget 70s each. Add 30s of headroom
  // for workspace setup/navigation.
  test.setTimeout(150_000 + 150_000 + (RUNS_PER_MODE - 1) * 70_000 + 30_000);
  await enableEditorTestMode(page);
  await openLocalDemoWorkspace(page);
  await page.locator('select[title*="WASM Sandbox"]').selectOption('docker');
  await primeRepositoryBuildMode(page);

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
