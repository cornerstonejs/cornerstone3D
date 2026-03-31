import { test } from '@playwright/test';
import {
  checkForScreenshot,
  getVisibleViewportCanvas,
  screenShotPaths,
} from './utils/index';

const EXAMPLE = 'multiVolumeAPI';
const SETTLE_MS = 8000;

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

function createMultiVolumeTests(mode: string, screenshotPath: string) {
  test(`should render fused multi-volume data (${mode})`, async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(page, locator, screenshotPath);
  });
}

test.describe('Multi Volume API - Legacy', () => {
  test.beforeEach(navigateToExample());

  createMultiVolumeTests(
    'legacy',
    screenShotPaths.multiVolumeAPINext.legacyViewport
  );
});

test.describe('Multi Volume API - Next (GPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next' }));

  createMultiVolumeTests(
    'next GPU',
    screenShotPaths.multiVolumeAPINext.nextViewport
  );
});

test.describe('Multi Volume API - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next', cpu: 'true' }));

  createMultiVolumeTests(
    'next CPU',
    screenShotPaths.multiVolumeAPINext.nextCpuViewport
  );
});
