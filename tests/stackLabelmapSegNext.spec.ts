import { test } from '@playwright/test';
import {
  checkForScreenshot,
  getVisibleViewportCanvas,
  screenShotPaths,
  simulateDrag,
} from './utils/index';

const EXAMPLE = 'stackLabelmapSegmentation';
const SETTLE_MS = 10000;

function navigateToExample(params?: Record<string, string>) {
  return async ({ page }) => {
    const url = new URL(`http://localhost:3333/${EXAMPLE}.html`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    await page.goto(url.toString());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('div#content canvas', {
      state: 'visible',
    });
    await page.waitForTimeout(SETTLE_MS);
  };
}

test.describe.configure({ mode: 'serial' });

async function paintBrushStroke(page) {
  const canvas = getVisibleViewportCanvas(page);
  await simulateDrag(page, canvas);
  await page.waitForTimeout(1500);
}

test.describe('Stack Labelmap Segmentation - Legacy', () => {
  test.beforeEach(navigateToExample());

  test('should paint a brush stroke (legacy)', async ({ page }) => {
    await paintBrushStroke(page);
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackLabelmapSegNext.legacyBrush
    );
  });
});

test.describe('Stack Labelmap Segmentation - Next (GPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next' }));

  test('should paint a brush stroke (next GPU)', async ({ page }) => {
    await paintBrushStroke(page);
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackLabelmapSegNext.nextBrush
    );
  });
});

test.describe('Stack Labelmap Segmentation - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next', cpu: 'true' }));

  test('should paint a brush stroke (next CPU)', async ({ page }) => {
    await paintBrushStroke(page);
    const locator = getVisibleViewportCanvas(page);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackLabelmapSegNext.nextCpuBrush
    );
  });
});
