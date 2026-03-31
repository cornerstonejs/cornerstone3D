import { test } from '@playwright/test';
import { checkForScreenshot, screenShotPaths } from './utils/index';

const EXAMPLE = 'wsi';
const SETTLE_MS = 5000;

function navigateToExample(params?: Record<string, string>) {
  return async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const link = page.locator(`a:has-text("${EXAMPLE}")`).first();
    const href = await link.getAttribute('href');
    const url = new URL(href, page.url());
    url.pathname = url.pathname.replace(/\.html$/, '');

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    await page.goto(url.toString());
    await page.waitForSelector('div#content');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);
  };
}

test.describe('WSI Viewport - Legacy', () => {
  test.beforeEach(navigateToExample());

  test('should render WSI data (legacy)', async ({ page }) => {
    const locator = page.locator('#cornerstone-element');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.wsiNext.legacyViewport
    );
  });
});

test.describe('WSI Viewport - Next', () => {
  test.beforeEach(navigateToExample({ type: 'next' }));

  test('should render WSI data (next)', async ({ page }) => {
    const locator = page.locator('#cornerstone-element');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.wsiNext.nextViewport
    );
  });
});
