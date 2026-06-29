import { test } from 'playwright-test-coverage';
import type { Page, Locator } from '@playwright/test';
import {
  checkForCanvasSnapshot,
  visitExample,
  screenShotPaths,
  waitForImageRendered,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'splineContourSegmentationTools');
});

test.describe('Spline Contour Segmentation Tools', async () => {
  test('should draw a CatmullRom Spline ROI when CatmullRom Spline ROI is selected', async ({
    page,
  }) => {
    const canvas = await page.locator('canvas.cornerstone-canvas');

    await drawCatmullROMSplineOnViewportLeft({
      page,
      canvas,
      segmentIndex: undefined,
    });
    await checkForCanvasSnapshot(
      page,
      'canvas.cornerstone-canvas',
      screenShotPaths.splineContourSegmentationTools.catmullRomSplineROI
    );
  });

  test('should draw a Linear Spline ROI when Linear Spline ROI is selected', async ({
    page,
  }) => {
    const canvas = await page.locator('canvas.cornerstone-canvas');

    await drawLinearSplineOnViewportCenter({
      page,
      canvas,
      segmentIndex: undefined,
    });
    await checkForCanvasSnapshot(
      page,
      'canvas.cornerstone-canvas',
      screenShotPaths.splineContourSegmentationTools.linearSplineROI
    );
  });

  test('should draw a BSpline ROI when BSpline ROI is selected when BSpline ROI is selected', async ({
    page,
  }) => {
    const canvas = await page.locator('canvas.cornerstone-canvas');

    await drawBSplineOnViewportRight({
      page,
      canvas,
      segmentIndex: undefined,
    });
    await checkForCanvasSnapshot(
      page,
      'canvas.cornerstone-canvas',
      screenShotPaths.splineContourSegmentationTools.bsplineROI
    );
  });

  test('should have different colors when splines are added to different segments', async ({
    page,
  }) => {
    const canvas = await page.locator('canvas.cornerstone-canvas');

    await drawCatmullROMSplineOnViewportLeft({
      page,
      canvas,
      segmentIndex: 1,
    });
    await drawLinearSplineOnViewportCenter({ page, canvas, segmentIndex: 2 });
    await drawBSplineOnViewportRight({ page, canvas, segmentIndex: 3 });
    await checkForCanvasSnapshot(
      page,
      'canvas.cornerstone-canvas',
      screenShotPaths.splineContourSegmentationTools.splinesOnSegmentTwo
    );
  });

  test.skip('should apply the styles to the splines appropriately when splines are drawn with different styles', async ({
    page,
  }) => {
    const canvas = await page.locator('canvas.cornerstone-canvas');
    const splineStyle = {
      outlineWidth: 1.7,
      outlineOpacity: 0.5,
      fillAlpha: 0,
      outlineDash: 3,
    };

    await updateSplineStyleInputs({ page, splineStyle });
    await drawCatmullROMSplineOnViewportLeft({
      page,
      canvas,
      segmentIndex: 1,
    });
    await drawLinearSplineOnViewportCenter({ page, canvas, segmentIndex: 2 });
    await drawBSplineOnViewportRight({
      page,
      canvas,
      segmentIndex: 3,
    });
    await checkForCanvasSnapshot(
      page,
      'canvas.cornerstone-canvas',
      screenShotPaths.splineContourSegmentationTools.splinesOnSegmentTwo
    );
  });
});

async function updateSplineStyleInputs({ page, splineStyle }) {
  const keys = Object.keys(splineStyle);

  for (const key of keys) {
    await page.locator(`#${key}`).fill(String(splineStyle[key]));
  }
}

async function drawSpline({
  page,
  canvas,
  points,
  segmentIndex = 1,
  preSettleMs = 1000,
}) {
  // Let the viewport go fully idle before triggering the segment re-render, so
  // the wait-rendered below starts from a clean state. On the self-hosted runner
  // the segment-select re-render blanks the base image for a while (see below),
  // and a brief settle before it makes the subsequent wait reliable. Applied to
  // all spline draws.
  if (preSettleMs) {
    await page.waitForTimeout(preSettleMs);
  }
  // Activating/creating the segment fires a full viewport.render() (contour
  // display -> viewport.render()). On the self-hosted runner that render is slow
  // (GPU readback stalls) so the viewport sits on the cleared background for a
  // few hundred ms. Wait for that render to finish before placing control
  // points — otherwise the early clicks land while the canvas is blank /
  // mid-re-render and the contour is drawn at the wrong coordinates (a garbled
  // ROI: real cause of the spline snapshot diffs, not a fill-rendering issue).
  // Best-effort: if selecting the segment doesn't re-render (already active),
  // fall through rather than hang.
  try {
    await waitForImageRendered(
      page,
      () =>
        page.getByRole('combobox').first().selectOption(String(segmentIndex)),
      { elementSelector: '[data-viewport-uid]', timeout: 8000 }
    );
  } catch {
    // no re-render was triggered; nothing to wait for
  }

  for (const point of points) {
    await canvas.click({
      position: {
        x: point[0],
        y: point[1],
      },
    });
    // Small pause between control-point clicks so each registers in order.
    await page.waitForTimeout(150);
  }

  // Let the spline close and settle before the snapshot.
  await new Promise((resolve) => setTimeout(resolve, 400));
}

async function drawCatmullROMSplineOnViewportLeft({
  page,
  canvas,
  segmentIndex,
}: {
  page: Page;
  canvas: Locator;
  segmentIndex: number | undefined;
}) {
  await page.getByRole('combobox').nth(1).selectOption('CatmullRomSplineROI');

  const points = [
    [60, 150],
    [101, 149],
    [145, 166],
    [144, 189],
    [156, 185],
    [162, 203],
    [180, 209],
    [188, 253],
    [157, 289],
    [104, 283],
    [59, 251],
    [50, 196],
    [60, 143],
  ];

  await drawSpline({ page, canvas, points, segmentIndex });
}

async function drawLinearSplineOnViewportCenter({
  page,
  canvas,
  segmentIndex,
}) {
  await page.getByRole('combobox').nth(1).selectOption('LinearSplineROI');

  const points = [
    [263, 117],
    [311, 159],
    [327, 202],
    [322, 220],
    [330, 254],
    [350, 275],
    [302, 290],
    [275, 293],
    [196, 283],
    [166, 288],
    [190, 257],
    [205, 253],
    [203, 200],
    [226, 144],
    [264, 114],
  ];

  await drawSpline({ page, canvas, points, segmentIndex });
}

async function drawBSplineOnViewportRight({ page, canvas, segmentIndex }) {
  await page.getByRole('combobox').nth(1).selectOption('BSplineROI');

  const points = [
    [397, 50],
    [464, 109],
    [454, 265],
    [395, 326],
    [333, 261],
    [352, 115],
    [398, 49],
  ];

  await drawSpline({ page, canvas, points, segmentIndex });
}
