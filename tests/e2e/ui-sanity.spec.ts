import { expect, test } from '@playwright/test';

const getHorizontalOverflow = async (page: import('@playwright/test').Page) => (
  page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
);

const expectNoHorizontalOverflow = async (page: import('@playwright/test').Page) => {
  const metrics = await getHorizontalOverflow(page);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 4);
};

const openRepoChooser = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await expect(page.getByTestId('local-demo-login')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('local-demo-login').click();
  await expect(page.getByRole('link', { name: /open workspace/i })).toBeVisible({ timeout: 30_000 });
  await page.goto('/workspace');
  await expect(page.getByTestId('open-demo-workspace')).toBeVisible({ timeout: 30_000 });
};

test('landing page stays readable at the current viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('local-demo-login')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('github-login-button')).toBeVisible();
  await expect(page.getByRole('heading', { name: /review, edit, and publish/i })).toBeVisible();
  await expect(page.getByText(/access your course repositories/i)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('repository chooser stays readable at the current viewport', async ({ page }) => {
  await openRepoChooser(page);
  await expect(page.getByTestId('open-demo-workspace')).toBeVisible();
  await expect(page.getByTestId('team-code-input')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
