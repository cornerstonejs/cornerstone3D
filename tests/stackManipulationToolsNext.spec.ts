import { test } from '@playwright/test';
import {
  checkForScreenshot,
  getVisibleViewportCanvas,
  screenShotPaths,
} from './utils/index';

const EXAMPLE = 'stackManipulationTools';
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

/** Right-click drag (zoom) from an off-center point. */
async function zoomOffCenter(page, locator) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Canvas element is not visible');
  }

  // Start from upper-left quadrant – off-center
  const sx = box.x + box.width * 0.3;
  const sy = box.y + box.height * 0.3;

  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(sx, sy - 60, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(500);
}

/** Middle-click drag (pan). */
async function panViewport(page, locator, dx: number, dy: number) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Canvas element is not visible');
  }

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Legacy
// ---------------------------------------------------------------------------

test.describe('Stack Manipulation - Legacy', () => {
  test.beforeEach(navigateToExample());

  test('should zoom off-center with right click (legacy)', async ({
    page,
  }) => {
    const locator = getVisibleViewportCanvas(page);
    await zoomOffCenter(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.legacyZoom
    );
  });

  test('should pan with middle click (legacy)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await panViewport(page, locator, 50, 30);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.legacyPan
    );
  });

  test('should zoom then pan (legacy)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await zoomOffCenter(page, locator);
    await panViewport(page, locator, 40, -20);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.legacyZoomAndPan
    );
  });
});

// ---------------------------------------------------------------------------
// Next (GPU)
// ---------------------------------------------------------------------------

test.describe('Stack Manipulation - Next (GPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next' }));

  test('should zoom off-center with right click (next GPU)', async ({
    page,
  }) => {
    const locator = getVisibleViewportCanvas(page);
    await zoomOffCenter(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.nextZoom
    );
  });

  test('should pan with middle click (next GPU)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await panViewport(page, locator, 50, 30);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.nextPan
    );
  });

  test('should zoom then pan (next GPU)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await zoomOffCenter(page, locator);
    await panViewport(page, locator, 40, -20);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.nextZoomAndPan
    );
  });
});

// ---------------------------------------------------------------------------
// Next (CPU)
// ---------------------------------------------------------------------------

test.describe('Stack Manipulation - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next', cpu: 'true' }));

  test('should zoom off-center with right click (next CPU)', async ({
    page,
  }) => {
    const locator = getVisibleViewportCanvas(page);
    await zoomOffCenter(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.nextCpuZoom
    );
  });

  test('should pan with middle click (next CPU)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await panViewport(page, locator, 50, 30);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.nextCpuPan
    );
  });

  test('should zoom then pan (next CPU)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await zoomOffCenter(page, locator);
    await panViewport(page, locator, 40, -20);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.nextCpuZoomAndPan
    );
  });
});
