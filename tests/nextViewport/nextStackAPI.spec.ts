import { test } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextStackAPI';
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

test.describe('Stack API Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('should use PlanarViewport GPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_STACK_NEXT',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'stack-api-next:primary': 'vtkImage',
        },
      },
    ]);
  });

  createStackAPITests('GPU', {
    setVoi: screenShotPaths.stackAPINext.setVoi,
    nextImage: screenShotPaths.stackAPINext.nextImage,
    flipH: screenShotPaths.stackAPINext.flipH,
    rotate: screenShotPaths.stackAPINext.rotate,
    invert: screenShotPaths.stackAPINext.invert,
    reset: screenShotPaths.stackAPINext.reset,
  });
});

test.describe('Stack API Next (CPU)', () => {
  test.beforeEach(navigateToExample({ cpu: 'true' }));

  test('should use PlanarViewport CPU runtime', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: 'myRenderingEngine',
        viewportId: 'CT_STACK_NEXT',
        constructorName: 'PlanarViewport',
        type: 'planarV2',
        renderModesByDataId: {
          'stack-api-next:primary': 'cpu2d',
        },
      },
    ]);
  });

  createStackAPITests('CPU', {
    setVoi: screenShotPaths.stackAPINext.cpuSetVoi,
    nextImage: screenShotPaths.stackAPINext.cpuNextImage,
    flipH: screenShotPaths.stackAPINext.cpuFlipH,
    rotate: screenShotPaths.stackAPINext.cpuRotate,
    invert: screenShotPaths.stackAPINext.cpuInvert,
    reset: screenShotPaths.stackAPINext.cpuReset,
  });
});
