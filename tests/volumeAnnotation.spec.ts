import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForCanvasSnapshot,
  getVisibleViewportCanvas,
  screenShotPaths,
  simulateDrag,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'volumeAnnotationTools');
});

// Apply N mouse-wheel ticks (positive = scroll down/forward, negative = back).
async function scrollSlices(page, locator, ticks: number) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Canvas element is not visible');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < Math.abs(ticks); i++) {
    await page.mouse.wheel(0, ticks > 0 ? 120 : -120);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
}

// Right-click drag (zoom) from an off-center point.
async function zoomOffCenter(
  page,
  locator,
  opts: { startFrac: [number, number]; dy: number }
) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Canvas element is not visible');
  }
  const sx = box.x + box.width * opts.startFrac[0];
  const sy = box.y + box.height * opts.startFrac[1];
  await page.mouse.move(sx, sy);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(sx, sy + opts.dy, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(500);
}

// Middle-click drag (pan).
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

test.describe('Volume Annotation Tools', async () => {
  test('should draw a length measurement on the viewport', async ({ page }) => {
    const locator = page.locator('.cornerstone-canvas').nth(0);
    await simulateDrag(page, locator, { steps: 10 });
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.volumeAnnotation.lengthTool,
      0,
      // Absorb sub-pixel font drift on the "138 mm" label across CI
      // environments; a missing/mis-drawn annotation differs by far more.
      { maxDiffPixelRatio: 0.003 }
    );
  });

  // Manipulation baselines lifted from the generic-viewport spec so both legacy
  // and next can share a single source of truth (next GPU+CPU baselines now
  // point at these files via `../../volumeAnnotation.spec.ts/`).
  test('should scroll, zoom, and pan all viewports', async ({ page }) => {
    const axial = getVisibleViewportCanvas(page, 0);
    const sagittal = getVisibleViewportCanvas(page, 1);
    const coronal = getVisibleViewportCanvas(page, 2);

    // Axial: scroll 3 slices, zoom in off-center top-left, pan right
    await scrollSlices(page, axial, 3);
    await zoomOffCenter(page, axial, { startFrac: [0.3, 0.3], dy: -60 });
    await panViewport(page, axial, 40, 20);

    // Sagittal: scroll 5 slices, zoom in off-center bottom-right, pan left-up
    await scrollSlices(page, sagittal, 5);
    await zoomOffCenter(page, sagittal, { startFrac: [0.7, 0.7], dy: -40 });
    await panViewport(page, sagittal, -30, -25);

    // Coronal (oblique): scroll 2 slices backward, zoom out center-right, pan down
    await scrollSlices(page, coronal, -2);
    await zoomOffCenter(page, coronal, { startFrac: [0.6, 0.4], dy: 50 });
    await panViewport(page, coronal, 10, 35);

    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.volumeAnnotation.axialManip,
      0
    );
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.volumeAnnotation.sagittalManip,
      1
    );
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.volumeAnnotation.coronalManip,
      2
    );
  });
});
