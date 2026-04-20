import { expect, test } from '@playwright/test';

const backendUrl = process.env.PLAYWRIGHT_BACKEND_URL || 'http://127.0.0.1:4002';
const githubToken = process.env.E2E_GITHUB_TOKEN || '';
const repoFullName = process.env.E2E_GITHUB_REPO || '';
const [owner, name] = repoFullName.split('/');
const targetFilePath = process.env.E2E_GITHUB_FILE || '';
const previewText = process.env.E2E_GITHUB_PREVIEW_TEXT || '';

const seedGitHubSession = async (page: import('@playwright/test').Page) => {
  const response = await page.context().request.post(`${backendUrl}/auth/test-session`, {
    data: {
      accessToken: githubToken,
      mode: 'github',
    },
  });
  expect(response.ok()).toBeTruthy();

  await page.addInitScript(
    ([repoOwner, repoName, fullName]) => {
      (window as Window & { __MRA_TEST__?: boolean }).__MRA_TEST__ = true;
      window.sessionStorage.setItem('selectedRepo', JSON.stringify({
        owner: repoOwner,
        name: repoName,
        fullName,
        defaultBranch: 'main',
      }));
    },
    [owner, name, repoFullName] as const
  );
};

test.describe('live GitHub repository smoke test', () => {
  test.skip(!githubToken || !owner || !name, 'Set E2E_GITHUB_TOKEN and E2E_GITHUB_REPO to run this spec.');

  test('loads a real GitHub repository and builds a preview', async ({ page }) => {
    await seedGitHubSession(page);
    await page.goto('/editor');

    await expect(page.getByTestId('build-repository-button')).toBeVisible();
    await expect(page.getByText(repoFullName)).toBeVisible();

    if (targetFilePath) {
      await page.locator(`[data-file-path="${targetFilePath}"]`).click();
    }

    await page.getByTestId('build-repository-button').click();
    await expect(page.locator('iframe[title="Build Preview"]')).toBeVisible();

    if (previewText) {
      const previewFrame = page.frameLocator('iframe[title="Build Preview"]');
      await expect(previewFrame.getByText(previewText, { exact: false })).toBeVisible();
    }
  });
});
