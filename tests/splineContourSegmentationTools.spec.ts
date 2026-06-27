import { test } from 'playwright-test-coverage';
import type { Page, Locator } from '@playwright/test';
import {
  checkForCanvasSnapshot,
  visitExample,
  screenShotPaths,
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

// The control points are authored in the 512x512 canvas backing-store space
// (the snapshot size). `canvas.click({ position })` is in the element's CSS
// pixel space, which equals the backing store only when the canvas is rendered
// at 512 CSS px. When scaleToCanvas is set, scale the points by the live
// boundingBox so a click lands at the intended backing-store location no matter
// what CSS size the runner gives the canvas. bspline's points reach the right
// edge (x up to 464), so on a wider canvas they map far off-target and the
// contour is drawn clipped (a tiny sliver) — this scaling makes it
// resolution-independent.
const AUTHORED_CANVAS_SIZE = 512;

async function drawSpline({
  page,
  canvas,
  points,
  segmentIndex = 1,
  scaleToCanvas = false,
}) {
  await page.getByRole('combobox').first().selectOption(String(segmentIndex));

  const box = scaleToCanvas ? await canvas.boundingBox() : null;
  if (scaleToCanvas && !box) {
    throw new Error('drawSpline: canvas is not visible');
  }
  if (box) {
    // TEMP DIAGNOSTIC: confirm the canvas CSS size vs the 512 authoring size.
    // eslint-disable-next-line no-console
    console.log(`SPLINE_BOX ${box.width}x${box.height}`);
  }
  const toPosition = (point) =>
    box
      ? {
          x: (point[0] * box.width) / AUTHORED_CANVAS_SIZE,
          y: (point[1] * box.height) / AUTHORED_CANVAS_SIZE,
        }
      : { x: point[0], y: point[1] };

  for (const point of points) {
    await canvas.click({ position: toPosition(point) });
    // Pause between control-point clicks so each one registers before the next.
    // On the self-hosted runner back-to-back canvas clicks are otherwise dropped
    // and the contour is drawn with missing points.
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

  // bspline reaches the right edge of the canvas, so it must be drawn relative
  // to the live canvas size to land on-target on any runner.
  await drawSpline({ page, canvas, points, segmentIndex, scaleToCanvas: true });
}
