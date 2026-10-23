import { expect, test, type Page } from '@playwright/test';

// Checks the editor layout in a real browser: the preview stays beside the
// editor once a file is open, the sidebar keeps the file tree uncluttered with
// review in its own tab, and the first-run polish (intro, labels, empty state).
//
// Pyodide normally comes from a CDN. A tiny stand-in is served instead so the
// in-browser draft preview works the same everywhere, including offline CI.

const backendUrl = process.env.PLAYWRIGHT_BACKEND_URL || 'http://127.0.0.1:4002';

const demoRepo = {
  owner: 'demo',
  name: 'course-demo',
  fullName: 'demo/course-demo',
  defaultBranch: 'main',
};

const fakePyodide = `
window.loadPyodide = async () => ({
  runPython: (code) => (code.includes('pretext_to_html(') ? '<h1>Draft preview works</h1>' : ''),
  globals: { get: () => undefined, set: () => undefined },
});
`;

const prepareEditor = async (page: Page) => {
  await page.route('**/pyodide.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fakePyodide }),
  );
  await page.addInitScript((repo) => {
    (window as Window & { __MRA_TEST__?: boolean }).__MRA_TEST__ = true;
    window.localStorage.setItem('proofdesk_tour_v1', '1');
    window.sessionStorage.setItem('selectedRepo', JSON.stringify(repo));
  }, demoRepo);

  const response = await page.context().request.post(`${backendUrl}/auth/test-session`, {
    data: { accessToken: 'local-test', mode: 'local-test', user: { login: 'local-tester', name: 'Local Test User' } },
  });
  expect(response.ok()).toBeTruthy();

  await page.goto('/editor');
};

const openEditor = async (page: Page) => {
  await prepareEditor(page);
  await expect(page.locator('[data-file-path="course.xml"]')).toBeVisible({ timeout: 45_000 });
};

test.describe('editor layout', () => {
  test('keeps the live preview beside the editor after a file is opened', async ({ page }) => {
    test.setTimeout(90_000);
    await openEditor(page);

    // Nothing open yet: an invitation, not a blank editor.
    await expect(page.getByTestId('editor-empty-state')).toContainText('No file open');

    await page.locator('[data-file-path="course.xml"]').click();
    await expect(page.getByTestId('editor-empty-state')).toBeHidden();

    // The regression: opening a file used to hide the preview altogether.
    const preview = page.frameLocator('iframe[title="Build Preview"]');
    await expect(preview.getByText('Draft preview works')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Rebuild preview' })).toBeVisible();

    // File names keep their real case.
    await expect(page.locator('[data-tab-path="course.xml"]')).toHaveText(/course\.xml/);
    await expect(page.locator('[data-tab-path="course.xml"] span.truncate')).toHaveCSS('text-transform', 'none');

    // The toolbar fits its pane: nothing wraps or is cut off.
    const overflow = await page.locator('.editor-preview-toolbar').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // Status bar is sentence case.
    await expect(page.getByText('Repository build').or(page.getByText('Single file'))).toBeVisible();
  });

  test('puts review and comments in their own tab, away from the file tree', async ({ page }) => {
    test.setTimeout(90_000);
    await openEditor(page);

    await expect(page.getByRole('heading', { name: 'Inline comments' })).toBeHidden();
    await expect(page.getByText('Review dashboard')).toBeHidden();

    await page.getByRole('button', { name: 'Review and comments' }).click();
    await expect(page.getByRole('heading', { name: 'Inline comments' })).toBeVisible();
    await expect(page.locator('[data-file-path="course.xml"]')).toBeHidden();

    // The comment form fits the sidebar instead of running off its edge.
    const sidebar = await page.locator('aside').first().boundingBox();
    const comment = await page.getByRole('textbox', { name: 'Comment' }).boundingBox();
    expect(sidebar && comment).toBeTruthy();
    expect(comment!.x + comment!.width).toBeLessThanOrEqual(sidebar!.x + sidebar!.width);

    await page.getByRole('button', { name: 'Repository Explorer' }).click();
    await expect(page.locator('[data-file-path="course.xml"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Inline comments' })).toBeHidden();
  });

  test('keeps every top-bar action named when the labels are hidden on a phone', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    // The file tree can sit behind the sidebar toggle on a small screen; the top bar is what matters here.
    await prepareEditor(page);
    for (const name of ['Back to Dashboard', 'Save All', 'Build Preview', 'Export ZIP', 'Export PDF', 'Split View', 'Account menu']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
  });
});

test.describe('first visit', () => {
  test('the intro plays once per session, and a click skips it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.intro-splash')).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(page.locator('.intro-splash')).toBeHidden();

    await page.reload();
    await expect(page.getByRole('heading', { name: /the editor your/i })).toBeVisible();
    await expect(page.locator('.intro-splash')).toHaveCount(0);
  });

  test('the workspace page is plainly named and its code field is readable and labelled', async ({ page }) => {
    await page.context().request.post(`${backendUrl}/auth/test-session`, {
      data: { accessToken: 'local-test', mode: 'local-test', user: { login: 'local-tester', name: 'Local Test User' } },
    });
    await page.goto('/workspace');
    await expect(page.getByRole('heading', { name: 'Open a workspace' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Session code' })).toHaveAttribute('placeholder', '6-character code');
    await expect(page.getByRole('button', { name: 'Join session' })).toBeVisible();
  });
});
