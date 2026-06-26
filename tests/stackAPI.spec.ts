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
    await page.getByRole('button', { name: 'Set VOI Range' }).click();
    // TEMP DIAGNOSTIC — read viewport VOI state immediately and after a settle,
    // to distinguish "state wrong" (override/flag) from "render wrong".
    const read = () =>
      page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cs = (window as any).cornerstone;
        const engines = cs.getRenderingEngines?.() ?? [];
        const vp = engines[0]?.getViewports?.()[0];
        if (!vp) {
          return {
            err: 'no viewport',
            csKeys: Object.keys(cs || {}).slice(0, 40),
            engines: engines.length,
          };
        }
        const p = vp.getProperties();
        return { voiRange: p.voiRange, locked: p.voiUpdatedWithSetProperties };
      });
    const immediate = await read();
    await page.waitForTimeout(2000);
    const delayed = await read();
    // eslint-disable-next-line no-console
    console.log(
      'VOI_DIAG immediate=' +
        JSON.stringify(immediate) +
        ' delayed=' +
        JSON.stringify(delayed)
    );
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
