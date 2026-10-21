import { expect, test, type Page, type Route } from '@playwright/test';

// Drives the real editor through a failed streamed build. Docker is not
// needed: /build/init is forced onto the streaming path, and the build log
// and AI answer are served by the test, so this checks the editor's wiring:
// the log panel stays open on failure, the explanation appears, its location
// opens the file, and the failure notice can bring the explanation back.

const backendUrl = process.env.PLAYWRIGHT_BACKEND_URL || 'http://127.0.0.1:4002';
const frontendOrigin = 'http://127.0.0.1:4173';

const demoRepo = {
  owner: 'demo',
  name: 'course-demo',
  fullName: 'demo/course-demo',
  defaultBranch: 'main',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': frontendOrigin,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const failedResult = {
  success: false,
  error: 'Build failed',
  code: 'course_source_invalid',
  advice: 'Check the recent XML or PreTeXt edits first.',
};

const explanation = {
  summary: 'A paragraph in course.xml is never closed.',
  likelyCause: 'The <p> opened on line 3 has no matching </p>.',
  fixSteps: ['Open course.xml', 'Add </p> at the end of the paragraph on line 3'],
  location: 'course.xml:3',
  confidence: 'high',
};

const sseBody = [
  `data: ${JSON.stringify({ line: 'Building HTML...', stream: 'stdout' })}`,
  '',
  `data: ${JSON.stringify({ line: 'course.xml:3: parser error : Opening and ending tag mismatch: p line 3 and section', stream: 'stderr' })}`,
  '',
  'event: done',
  `data: ${JSON.stringify(failedResult)}`,
  '',
  '',
].join('\n');

const preflight = (route: Route) =>
  route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: corsHeaders }).then(() => true) : Promise.resolve(false);

const mockFailingStreamedBuild = async (page: Page) => {
  let explainCalls = 0;

  await page.route('**/build/init', async (route) => {
    if (await preflight(route)) return;
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { sessionId: body.sessionId, building: true } });
  });

  await page.route('**/build/logs/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: sseBody,
    }),
  );

  await page.route('**/build/explain-error/**', async (route) => {
    if (await preflight(route)) return;
    if (route.request().url().endsWith('/feedback')) {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    explainCalls += 1;
    await route.fulfill({ status: 200, headers: corsHeaders, json: { explanation, id: 'feedfacefeedface', cached: false } });
  });

  return { explainCalls: () => explainCalls };
};

const openSeededEditorWorkspace = async (page: Page) => {
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

test('a failed build keeps the log open, explains the error, and jumps to it', async ({ page }) => {
  test.setTimeout(90_000);
  const mocks = await mockFailingStreamedBuild(page);
  // Opening the workspace starts its build through /build/init, which the
  // mock turns into a streamed build that fails.
  await openSeededEditorWorkspace(page);

  // The regression: the panel used to close the moment the build finished.
  const panel = page.getByRole('dialog', { name: 'Build log' });
  await expect(panel.getByText('Build failed', { exact: true })).toBeVisible();
  await page.waitForTimeout(1_000);
  await expect(panel).toBeVisible();
  await expect(panel.getByText(failedResult.advice)).toBeVisible();

  await panel.getByRole('button', { name: /explain this error/i }).click();
  await expect(panel.getByText(explanation.summary)).toBeVisible();
  expect(mocks.explainCalls()).toBe(1);

  await panel.getByRole('button', { name: 'Yes, this explanation helped' }).click();
  await expect(panel.getByText(/thanks for the feedback/i)).toBeVisible();

  await panel.getByRole('button', { name: explanation.location }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('[data-tab-path="course.xml"][data-active="true"]')).toBeVisible();

  // The AI's pointer shows up as a problem on that file.
  await page.getByTitle('Open Problems panel').click();
  await expect(page.getByText(`AI: ${explanation.summary}`).first()).toBeVisible();

  // The notice reopens the panel over the finished build with the same answer,
  // without asking the model again.
  await page.getByRole('button', { name: /show explanation/i }).click();
  await expect(panel.getByText(explanation.summary)).toBeVisible();
  expect(mocks.explainCalls()).toBe(1);
});
