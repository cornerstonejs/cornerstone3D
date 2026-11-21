import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { createExampleUrl, screenShotPaths } from '../utils/index';

const EXAMPLE = 'videoContourSegmentation';
const SETTLE_MS = 8000;
const SEGMENTATION_ID = 'SEGMENTATION_ID';

/** A pixel counts as changed when its R, G and B differ by more than this in sum. */
const CHANGED_PIXEL_DELTA = 30;

/** The closed path of the contour, as parts of the width and height of the viewport. */
const CONTOUR = { center: [0.45, 0.5], radius: [0.08, 0.2], points: 24 };

/** The number of pixels that differ between two screenshots of one size. */
function changedPixels(before: Buffer, after: Buffer): number {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(after);
  let count = 0;

  for (let index = 0; index < a.data.length; index += 4) {
    const delta =
      Math.abs(a.data[index] - b.data[index]) +
      Math.abs(a.data[index + 1] - b.data[index + 1]) +
      Math.abs(a.data[index + 2] - b.data[index + 2]);

    if (delta > CHANGED_PIXEL_DELTA) {
      count++;
    }
  }

  return count;
}

/** Draws a closed freehand contour with the mouse, then moves the mouse away. */
async function drawContour(page) {
  const box = await page.locator('[data-viewport-uid]').first().boundingBox();
  const points = Array.from({ length: CONTOUR.points + 1 }, (_, index) => {
    const angle = (index / CONTOUR.points) * Math.PI * 2;

    return [
      box.x +
        box.width * (CONTOUR.center[0] + CONTOUR.radius[0] * Math.cos(angle)),
      box.y +
        box.height * (CONTOUR.center[1] + CONTOUR.radius[1] * Math.sin(angle)),
    ];
  });

  await page.mouse.move(points[0][0], points[0][1]);
  await page.mouse.down();

  for (const [x, y] of points.slice(1)) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(20);
  }

  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(500);
}

/** The contour style of the segmentation of the example. */
function readContourStyle(page) {
  return page.evaluate(
    (segmentationId) =>
      window.cornerstoneTools.segmentation.config.style.getStyle({
        segmentationId,
        type: 'Contour',
      }),
    SEGMENTATION_ID
  );
}

/** Moves a slider of the toolbar to a value and waits for the redraw. */
async function setSlider(page, id: string, value: number) {
  await page.locator(`#${id}`).fill(String(value));
  await page.waitForTimeout(1000);
}

test.describe('Video Contour Segmentation - Next', () => {
  test('loads, draws a contour over the video, and its sliders change the style', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(createExampleUrl(EXAMPLE + '.html').toString());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('div#content video', {
      state: 'attached',
      timeout: 60000,
    });
    await page.waitForTimeout(SETTLE_MS);

    expect(pageErrors).toEqual([]);

    const viewport = page.locator('[data-viewport-uid]').first();
    const before = await viewport.screenshot();

    await drawContour(page);

    const drawn = await viewport.screenshot();
    const annotationCount = await page.evaluate(
      () => window.cornerstoneTools.annotation.state.getAllAnnotations().length
    );

    expect(annotationCount).toBe(1);
    expect(changedPixels(before, drawn)).toBeGreaterThan(1000);
    expect(drawn).toMatchSnapshot(
      screenShotPaths.videoContourSegmentationNext.contour,
      {
        threshold: 0.1,
        maxDiffPixelRatio: 0.01,
      }
    );

    await setSlider(page, 'outlineWidth', 8);

    const wide = await viewport.screenshot();

    expect((await readContourStyle(page)).outlineWidth).toBe(8);
    expect(changedPixels(drawn, wide)).toBeGreaterThan(200);

    await setSlider(page, 'fillAlpha', 0);

    const unfilled = await viewport.screenshot();

    expect((await readContourStyle(page)).fillAlpha).toBe(0);
    expect(changedPixels(wide, unfilled)).toBeGreaterThan(1000);
    expect(pageErrors).toEqual([]);
  });
});
