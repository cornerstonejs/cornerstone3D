import { expect, test } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  getVisibleViewportCanvas,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextStackAPI';
const SETTLE_MS = 5000;

function navigateToExample(
  params?: Record<string, string>,
  options: {
    settleMs?: number;
    waitForCanvas?: boolean;
    waitForNetworkIdle?: boolean;
  } = {}
) {
  return async ({ page }) => {
    const {
      settleMs = SETTLE_MS,
      waitForCanvas = true,
      waitForNetworkIdle = false,
    } = options;
    const url = new URL(`http://localhost:3333/${EXAMPLE}.html`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    await page.goto(url.toString());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('div#content', {
      state: 'visible',
      timeout: 30000,
    });

    if (waitForCanvas) {
      await page.waitForSelector('#content canvas:visible', {
        state: 'visible',
        timeout: 30000,
      });
    }

    if (waitForNetworkIdle) {
      await page.waitForLoadState('networkidle');
    }

    if (settleMs > 0) {
      await page.waitForTimeout(settleMs);
    }
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

test.describe('Stack API Next (CPU readiness)', () => {
  test('should keep toolbar disabled until the stack is ready (CPU)', async ({
    page,
  }) => {
    await navigateToExample(
      { cpu: 'true', stackReadyDelayMs: '1000' },
      { settleMs: 0, waitForCanvas: false }
    )({ page });

    const nextImageButton = page.getByRole('button', { name: 'Next Image' });

    await expect(nextImageButton).toBeDisabled();
    await expect(nextImageButton).toBeEnabled({ timeout: 15000 });
    await nextImageButton.click();

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const engine =
            window.cornerstone?.getRenderingEngine?.('myRenderingEngine');
          const viewport = engine?.getViewport?.('CT_STACK_NEXT');

          return viewport?.getCurrentImageIdIndex?.() ?? -1;
        });
      })
      .toBe(1);
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
          'stack-api-next:primary': 'cpuImage',
        },
      },
    ]);
  });

  test('should visually update after one next-image click (CPU)', async ({
    page,
  }) => {
    const locator = getVisibleViewportCanvas(page);
    const before = await locator.screenshot();

    await page.getByRole('button', { name: 'Next Image' }).click();

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const engine =
            window.cornerstone?.getRenderingEngine?.('myRenderingEngine');
          const viewport = engine?.getViewport?.('CT_STACK_NEXT');

          return viewport?.getCurrentImageIdIndex?.() ?? -1;
        });
      })
      .toBe(1);

    const after = await locator.screenshot();

    expect(before.equals(after)).toBe(false);
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
