import { expect, test } from '@playwright/test';

const backendUrl = process.env.PLAYWRIGHT_BACKEND_URL || 'http://127.0.0.1:4002';

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

const createAuthenticatedSession = async (page: import('@playwright/test').Page) => {
  const response = await page.context().request.post(`${backendUrl}/auth/test-session`, {
    data: {
      accessToken: 'local-test',
      mode: 'local-test',
      user: {
        login: 'local-tester',
        name: 'Local Test User',
      },
    },
  });
  expect(response.ok()).toBeTruthy();
};

const seedEditorSession = async (page: import('@playwright/test').Page, extraSession = {}) => {
  await page.addInitScript(
    ([repo, extra]) => {
      window.sessionStorage.setItem('selectedRepo', JSON.stringify(repo));
      if (Object.keys(extra).length > 0) {
        window.sessionStorage.setItem('teamSession', JSON.stringify(extra));
      }
    },
    [demoRepo, extraSession] as const
  );
};

const waitForWorkspaceFiles = async (
  page: import('@playwright/test').Page,
  expectedPaths: string[] = ['course.xml', 'interactive.js']
) => {
  await expect.poll(async () => (
    page.evaluate(() => {
      const testWindow = window as Window & {
        __mraWorkspaceSnapshot?: {
          loading: boolean;
          repoFullName: string | null;
          filePaths: string[];
        };
      };
      return testWindow.__mraWorkspaceSnapshot || null;
    })
  ), { timeout: 45_000 }).not.toBeNull();

  await expect.poll(async () => (
    page.evaluate(() => {
      const testWindow = window as Window & {
        __mraWorkspaceSnapshot?: {
          loading: boolean;
          repoFullName: string | null;
          filePaths: string[];
        };
      };
      return testWindow.__mraWorkspaceSnapshot?.loading ?? true;
    })
  ), { timeout: 45_000 }).toBe(false);

  for (const path of expectedPaths) {
    await expect.poll(async () => (
      page.evaluate((targetPath) => {
        const testWindow = window as Window & {
          __mraWorkspaceSnapshot?: {
            filePaths: string[];
          };
        };
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

const openSeededEditorWorkspace = async (page: import('@playwright/test').Page, extraSession = {}) => {
  await enableEditorTestMode(page);
  await createAuthenticatedSession(page);
  await seedEditorSession(page, extraSession);
  await page.goto('/editor');
  await expect.poll(() => page.url()).toContain('/editor');
  await expect(page.getByRole('button', { name: /build preview|building/i }).first()).toBeVisible({ timeout: 30_000 });
  await waitForWorkspaceFiles(page);
  await expect(page.locator('[data-file-path="course.xml"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-file-path="interactive.js"]')).toBeVisible({ timeout: 30_000 });
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

test('opens the local demo workspace through the UI and builds a preview', async ({ page }) => {
  test.setTimeout(90_000);
  await enableEditorTestMode(page);
  await openLocalDemoWorkspace(page);

  await page.locator('[data-file-path="course.xml"]').click();
  await expect(page.getByRole('button', { name: /build preview|building/i }).first()).toBeVisible();
  await page.getByRole('button', { name: /build preview|building/i }).first().click();

  await expect(page.locator('iframe[title="Build Preview"]')).toBeVisible();
  const previewFrame = page.frameLocator('iframe[title="Build Preview"]');
  await expect(previewFrame.getByRole('heading', { name: /vectors/i })).toBeVisible({ timeout: 45_000 });
  await expect(previewFrame.getByRole('heading', { name: /matrices/i })).toBeVisible({ timeout: 45_000 });
  await expect(previewFrame.getByText(/local preview ready/i)).toBeVisible({ timeout: 45_000 });
});

test('updates the preview in live-edit mode for JavaScript changes', async ({ page }) => {
  test.setTimeout(90_000);
  await openSeededEditorWorkspace(page);

  await page.locator('[data-file-path="interactive.js"]').click();
  await waitForEditorTestHook(page);
  await page.getByRole('button', { name: /build preview|building/i }).first().click();
  await page.getByTestId('live-edit-toggle').click();

  await page.evaluate(() => {
    const nextValue = `
const badge = document.getElementById('demo-badge');

if (badge) {
  badge.textContent = 'Reviewed live by professor';
}
`;

    const testWindow = window as Window & {
      __mraSetActiveEditorValue?: (value: string) => void;
    };
    testWindow.__mraSetActiveEditorValue?.(nextValue);
  });

  await expect(page.locator('iframe[title="Build Preview"]')).toBeVisible();
  const previewFrame = page.frameLocator('iframe[title="Build Preview"]');
  await expect(previewFrame.getByText(/reviewed live by professor/i)).toBeVisible({ timeout: 45_000 });
});

test('shows team-session presence for the same local demo file in two pages', async ({ page }) => {
  test.setTimeout(150_000);
  await openSeededEditorWorkspace(page);

  await page.getByTestId('team-mode-toggle').click();
  const teamCodeButton = page.getByRole('button', { name: /^Code\s+[A-Z0-9]+$/i });
  await expect(teamCodeButton).toBeVisible({ timeout: 30_000 });
  const teamCodeLabel = await teamCodeButton.innerText();
  const teamCode = teamCodeLabel.replace('Code', '').trim();

  await page.locator('[data-file-path="course.xml"]').click();

  const teammatePage = await page.context().newPage();
  await teammatePage.addInitScript(() => {
    const testWindow = window as Window & { __MRA_TEST__?: boolean };
    testWindow.__MRA_TEST__ = true;
    window.localStorage.setItem('mra_collab_client_id', 'local-teammate-client');
    window.localStorage.setItem('proofdesk_tour_v1', '1');
  });
  await seedEditorSession(teammatePage, {
    code: teamCode,
    repo: demoRepo,
    hostName: 'Local Test User',
    hostLogin: 'local-tester',
    createdAt: new Date().toISOString(),
  });
  await teammatePage.goto('/editor');
  await expect(teammatePage.getByTestId('build-repository-button')).toBeVisible({ timeout: 60_000 });
  await waitForWorkspaceFiles(teammatePage, ['course.xml']);
  await teammatePage.locator('[data-file-path="course.xml"]').click();
  await waitForEditorTestHook(teammatePage);

  await expect.poll(async () => (
    page.evaluate(() => {
      const testWindow = window as Window & {
        __mraCollaborationSnapshot?: { count: number; status: string };
      };
      return testWindow.__mraCollaborationSnapshot?.count ?? 0;
    })
  ), { timeout: 45_000 }).toBeGreaterThanOrEqual(2);

  await expect.poll(async () => (
    teammatePage.evaluate(() => {
      const testWindow = window as Window & {
        __mraCollaborationSnapshot?: { count: number; status: string };
      };
      return testWindow.__mraCollaborationSnapshot?.count ?? 0;
    })
  ), { timeout: 45_000 }).toBeGreaterThanOrEqual(2);

  await teammatePage.close();
});
