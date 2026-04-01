import { test } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  screenShotPaths,
} from './utils/index';

const EXAMPLE = 'nextStackManipulationTools';
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

test.describe('Stack Manipulation - Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_STACK',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'stack-manipulation-tools-next:primary': 'vtkImage',
        },
      },
    ]);
  });

  test('should zoom off-center with right click (next GPU)', async ({
    page,
  }) => {
    const locator = getVisibleViewportCanvas(page);
    await zoomOffCenter(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.zoom
    );
  });

  test('should pan with middle click (next GPU)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await panViewport(page, locator, 50, 30);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.pan
    );
  });

  test('should zoom then pan (next GPU)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await zoomOffCenter(page, locator);
    await panViewport(page, locator, 40, -20);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.zoomAndPan
    );
  });
});

test.describe('Stack Manipulation - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ cpu: 'true' }));

  test('should use PlanarViewport CPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_STACK',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'stack-manipulation-tools-next:primary': 'cpu2d',
        },
      },
    ]);
  });

  test('should zoom off-center with right click (next CPU)', async ({
    page,
  }) => {
    const locator = getVisibleViewportCanvas(page);
    await zoomOffCenter(page, locator);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.cpuZoom
    );
  });

  test('should pan with middle click (next CPU)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await panViewport(page, locator, 50, 30);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.cpuPan
    );
  });

  test('should zoom then pan (next CPU)', async ({ page }) => {
    const locator = getVisibleViewportCanvas(page);
    await zoomOffCenter(page, locator);
    await panViewport(page, locator, 40, -20);
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.stackManipulationToolsNext.cpuZoomAndPan
    );
  });
});
