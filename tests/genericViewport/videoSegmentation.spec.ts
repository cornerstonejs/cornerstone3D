import { expect, test } from '@playwright/test';
import { createExampleUrl, screenShotPaths } from '../utils/index';

const EXAMPLE = 'videoSegmentation';
const SETTLE_MS = 8000;

/** The fill alpha of the default labelmap style, as a byte: 0.5 of 255. */
const FILL_ALPHA_BYTE = 128;

/** Where the stroke goes, as parts of the width and the height of the viewport. */
const STROKE = { from: [0.3, 0.3], to: [0.5, 0.3], steps: 10 };

function navigateToExample(params?: Record<string, string>) {
  return async ({ page }) => {
    const url = createExampleUrl(EXAMPLE + '.html');

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    await page.goto(url.toString());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('div#content video', {
      state: 'attached',
      timeout: 60000,
    });
    await page.waitForTimeout(SETTLE_MS);
  };
}

/**
 * Reads the labelmap layer of the video viewport, the canvas just above the
 * video: the number of pixels that show a label, the RGBA at a point given as
 * parts of the viewport size, and the frame on display.
 */
function readLabelmapLayer(page, point?: number[]) {
  return page.evaluate((at) => {
    const element = document.querySelector('[data-viewport-uid]');
    const layer = element.querySelector('video + canvas') as HTMLCanvasElement;
    const viewport = window.cornerstone
      .getRenderingEngines()[0]
      .getViewports()[0];

    if (!layer) {
      return { colored: 0, pixel: undefined, frame: viewport.getFrameNumber() };
    }

    const context = layer.getContext('2d');
    const data = context.getImageData(0, 0, layer.width, layer.height).data;
    let colored = 0;

    for (let index = 3; index < data.length; index += 4) {
      if (data[index]) {
        colored++;
      }
    }

    const pixel = at
      ? Array.from(
          context.getImageData(
            Math.floor(layer.width * at[0]),
            Math.floor(layer.height * at[1]),
            1,
            1
          ).data
        )
      : undefined;

    return { colored, pixel, frame: viewport.getFrameNumber() };
  }, point);
}

/** The colour of segment 1 of the segmentation of the example. */
function segmentOneColor(page) {
  return page.evaluate(() =>
    window.cornerstoneTools.segmentation.config.color.getSegmentIndexColor(
      'VIDEO_VIEWPORT',
      'VIDEO_SEGMENTATION',
      1
    )
  );
}

/** Shows a frame of the video and waits until the viewport shows it. */
async function goToFrame(page, frameNumber: number) {
  await page.evaluate((frame) => {
    window.cornerstone
      .getRenderingEngines()[0]
      .getViewports()[0]
      .setFrameNumber(frame);
  }, frameNumber);
  await page.waitForFunction(
    (frame) =>
      window.cornerstone
        .getRenderingEngines()[0]
        .getViewports()[0]
        .getFrameNumber() === frame,
    frameNumber
  );
  await page.waitForTimeout(1000);
}

/** Paints a stroke with the circular brush, then moves the mouse away. */
async function paintStroke(page) {
  await page.getByRole('combobox').first().selectOption('CircularBrush');

  const box = await page.locator('[data-viewport-uid]').first().boundingBox();
  const at = ([x, y]: number[]) => [
    box.x + box.width * x,
    box.y + box.height * y,
  ];
  const [startX, startY] = at(STROKE.from);

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  for (let step = 1; step <= STROKE.steps; step++) {
    const [x, y] = at([
      STROKE.from[0] + ((STROKE.to[0] - STROKE.from[0]) * step) / STROKE.steps,
      STROKE.from[1],
    ]);

    await page.mouse.move(x, y);
    await page.waitForTimeout(30);
  }

  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(500);
}

/**
 * Paints a stroke on the first frame and checks the labelmap layer: the
 * colour of segment 1 under the stroke, the picture of the viewport, nothing
 * on frame 6, and the stroke again on frame 1. The video viewport draws its
 * labelmap the same way with the CPU setting, so both runs compare with one
 * picture.
 */
async function paintsAndFollowsTheFrame(page) {
  const strokeMiddle = [(STROKE.from[0] + STROKE.to[0]) / 2, STROKE.from[1]];
  const loaded = await readLabelmapLayer(page, strokeMiddle);

  expect(loaded.frame).toBe(1);
  expect(loaded.colored).toBeGreaterThan(0);
  expect(loaded.pixel[3]).toBe(0);

  await paintStroke(page);

  const painted = await readLabelmapLayer(page, strokeMiddle);
  const [r, g, b] = await segmentOneColor(page);

  expect(painted.colored).toBeGreaterThan(loaded.colored);
  painted.pixel.forEach((value, index) =>
    expect(
      Math.abs(value - [r, g, b, FILL_ALPHA_BYTE][index])
    ).toBeLessThanOrEqual(2)
  );

  const viewport = page.locator('[data-viewport-uid]').first();

  expect(await viewport.screenshot()).toMatchSnapshot(
    screenShotPaths.videoSegmentationNext.brush,
    {
      threshold: 0.1,
      maxDiffPixelRatio: 0.01,
    }
  );

  await goToFrame(page, 6);
  expect((await readLabelmapLayer(page)).colored).toBe(0);

  await goToFrame(page, 1);
  expect((await readLabelmapLayer(page)).colored).toBe(painted.colored);
}

test.describe('Video Labelmap Segmentation - Next (GPU)', () => {
  test.beforeEach(navigateToExample());

  test('paints a labelmap over the video that follows the frame', async ({
    page,
  }) => {
    await paintsAndFollowsTheFrame(page);
  });
});

test.describe('Video Labelmap Segmentation - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ cpu: 'true' }));

  test('paints a labelmap over the video that follows the frame', async ({
    page,
  }) => {
    await paintsAndFollowsTheFrame(page);
  });
});
