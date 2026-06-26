import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForCanvasSnapshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackAPI');
});

test.describe.configure({ mode: 'serial' });

test.describe('Stack Viewport API', async () => {
  test('should display the initial image -- @debug', async ({ page }) => {
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.initial
    );
  });

  test('should set VOI range correctly -- @debug', async ({ page }) => {
    // Wait for the example's run() to finish applying its initial VOI before
    // interacting. On slow/self-hosted runners the stack image can still be
    // loading when the page is "ready", so without this the click lands before
    // run()'s setProperties(ctVoiRange) executes — and that late default-VOI
    // call then overwrites the range this test sets, leaving the snapshot at the
    // image's stored window. isComputedVOI flips to false once a
    // setProperties-driven VOI has been applied, which marks run() as done.
    await page.waitForFunction(
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cs = (window as any).cornerstone;
        const vp = cs?.getRenderingEngines?.()[0]?.getViewports?.()[0];
        return vp?.getProperties?.()?.isComputedVOI === false;
      },
      undefined,
      { timeout: 30000 }
    );
    await page.getByRole('button', { name: 'Set VOI Range' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.setVoiRange
    );
  });
  test('should move to next image', async ({ page }) => {
    await page.getByRole('button', { name: 'Next Image' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.nextImage
    );
  });
  test('should move to previous image', async ({ page }) => {
    await page.getByRole('button', { name: 'Next Image' }).click();
    await page.getByRole('button', { name: 'Previous Image' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.previousImage
    );
  });
  test('should flip horizontally ', async ({ page }) => {
    await page.getByRole('button', { name: 'Flip H' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.flipH
    );
  });
  test('should flip vertically ', async ({ page }) => {
    await page.getByRole('button', { name: 'Flip V' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.flipV
    );
  });
  test('should rotate absolute 150 degrees', async ({ page }) => {
    await page.getByRole('button', { name: 'Rotate Absolute 150' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.rotateAbsolute150
    );
  });
  test('should rotate delta 30 degrees', async ({ page }) => {
    await page.getByRole('button', { name: 'Rotate Delta 30' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.rotateDelta30
    );
  });
  test('should invert', async ({ page }) => {
    await page.getByRole('button', { name: 'Invert' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.invert
    );
  });
  test('should apply colormap', async ({ page }) => {
    await page.getByRole('button', { name: 'Apply Colormap' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.colormap
    );
  });

  test('should reset', async ({ page }) => {
    await page
      .getByRole('button', { name: 'Apply Random Zoom And Pan' })
      .click();
    await page.getByRole('button', { name: 'Rotate Random' }).click();
    await page.getByRole('button', { name: 'Reset Viewport' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.resetViewport
    );
  });

  test('should flip both h and v and be able to scroll and keep the flip', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Flip H' }).click();
    await page.getByRole('button', { name: 'Flip V' }).click();

    // click on next image
    await page.getByRole('button', { name: 'Next Image' }).click();
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.flipBoth
    );
  });
  test('should rotate 30, flip both, and scroll to next image preserving transforms', async ({
    page,
  }) => {
    // Rotate delta 30
    await page.getByRole('button', { name: 'Rotate Delta 30' }).click();

    // Flip horizontally
    await page.getByRole('button', { name: 'Flip H' }).click();

    // Flip vertically
    await page.getByRole('button', { name: 'Flip V' }).click();

    // Go to next image
    await page.getByRole('button', { name: 'Next Image' }).click();

    // Screenshot validation
    await checkForCanvasSnapshot(
      page,
      '.cornerstone-canvas',
      screenShotPaths.stackAPI.rotate30FlipBothNext
    );
  });
});
