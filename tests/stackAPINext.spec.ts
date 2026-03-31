import { test } from '@playwright/test';
import {
  checkForScreenshot,
  getVisibleViewportCanvas,
  screenShotPaths,
} from './utils/index';

const EXAMPLE = 'stackAPI';
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

function createStackAPITests(
  mode: string,
  paths: {
    setVoi: string;
    nextImage: string;
    flipH: string;
    rotate: string;
    invert: string;
    reset: string;
  }
) {
  test(`should set VOI range (${mode})`, async ({ page }) => {
    await page.getByRole('button', { name: 'Set VOI Range' }).click();
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(page, locator, paths.setVoi);
  });

  test(`should move to next image (${mode})`, async ({ page }) => {
    await page.getByRole('button', { name: 'Next Image' }).click();
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(page, locator, paths.nextImage);
  });

  test(`should flip horizontally (${mode})`, async ({ page }) => {
    await page.getByRole('button', { name: 'Flip H' }).click();
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(page, locator, paths.flipH);
  });

  test(`should rotate absolute 150 (${mode})`, async ({ page }) => {
    await page.getByRole('button', { name: 'Rotate Absolute 150' }).click();
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(page, locator, paths.rotate);
  });

  test(`should invert (${mode})`, async ({ page }) => {
    await page.getByRole('button', { name: 'Invert' }).click();
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(page, locator, paths.invert);
  });

  test(`should reset after random transforms (${mode})`, async ({ page }) => {
    await page
      .getByRole('button', { name: 'Apply Random Zoom And Pan' })
      .click();
    await page.getByRole('button', { name: 'Rotate Random' }).click();
    await page.getByRole('button', { name: 'Reset Viewport' }).click();
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(page, locator, paths.reset);
  });
}

test.describe('Stack API - Legacy', () => {
  test.beforeEach(navigateToExample());

  createStackAPITests('legacy', {
    setVoi: screenShotPaths.stackAPINext.legacySetVoi,
    nextImage: screenShotPaths.stackAPINext.legacyNextImage,
    flipH: screenShotPaths.stackAPINext.legacyFlipH,
    rotate: screenShotPaths.stackAPINext.legacyRotate,
    invert: screenShotPaths.stackAPINext.legacyInvert,
    reset: screenShotPaths.stackAPINext.legacyReset,
  });
});

test.describe('Stack API - Next (GPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next' }));

  createStackAPITests('next GPU', {
    setVoi: screenShotPaths.stackAPINext.nextSetVoi,
    nextImage: screenShotPaths.stackAPINext.nextNextImage,
    flipH: screenShotPaths.stackAPINext.nextFlipH,
    rotate: screenShotPaths.stackAPINext.nextRotate,
    invert: screenShotPaths.stackAPINext.nextInvert,
    reset: screenShotPaths.stackAPINext.nextReset,
  });
});

test.describe('Stack API - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next', cpu: 'true' }));

  createStackAPITests('next CPU', {
    setVoi: screenShotPaths.stackAPINext.nextCpuSetVoi,
    nextImage: screenShotPaths.stackAPINext.nextCpuNextImage,
    flipH: screenShotPaths.stackAPINext.nextCpuFlipH,
    rotate: screenShotPaths.stackAPINext.nextCpuRotate,
    invert: screenShotPaths.stackAPINext.nextCpuInvert,
    reset: screenShotPaths.stackAPINext.nextCpuReset,
  });
});
