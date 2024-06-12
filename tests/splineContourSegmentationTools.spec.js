import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

async function updateSplineStyleInputs({ page, splineStyle }) {
  const keys = Object.keys(splineStyle);

  for (const key of keys) {
    await page.locator(`#${key}`).fill(String(splineStyle[key]));
  }
}

async function drawSpline({ page, canvas, points, segmentIndex = 1 }) {
  await page.getByRole('combobox').first().selectOption(String(segmentIndex));

  for (const point of points) {
    await canvas.click({
      position: {
        x: point[0],
        y: point[1],
      },
    });
  }

  // Wait a few milliseconds otherwise the spline does not close
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function drawCatmullROMSplineOnViewportLeft({
  page,
  canvas,
  segmentIndex,
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

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'splineContourSegmentationTools');
});

test.describe('Spline Contour Segmentation Tools', async () => {
  test.describe('when CatmullRom Spline ROI is selected', async () => {
    test('it should draw a CatmullRom Spline ROI', async ({ page }) => {
      const canvas = await page.locator('canvas');

      await drawCatmullROMSplineOnViewportLeft({ page, canvas });
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.splineContourSegmentationTools.catmullRomSplineROI
      );
    });
  });

  test.describe('when Linear Spline ROI is selected', async () => {
    test('it should draw a Linear Spline ROI', async ({ page }) => {
      const canvas = await page.locator('canvas');

      await drawLinearSplineOnViewportCenter({ page, canvas });
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.splineContourSegmentationTools.linearSplineROI
      );
    });
  });

  test.describe('when BSpline ROI is selected', async () => {
    test('it should draw a BSpline ROI', async ({ page }) => {
      const canvas = await page.locator('canvas');

      await drawBSplineOnViewportRight({ page, canvas });
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.splineContourSegmentationTools.bsplineROI
      );
    });
  });

  test.describe('when splines are added to different segments', async () => {
    test('they must have different colors', async ({ page }) => {
      const canvas = await page.locator('canvas');

      await drawCatmullROMSplineOnViewportLeft({
        page,
        canvas,
        segmentIndex: 1,
      });
      await drawLinearSplineOnViewportCenter({ page, canvas, segmentIndex: 2 });
      await drawBSplineOnViewportRight({ page, canvas, segmentIndex: 3 });
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.splineContourSegmentationTools.splinesOnSegmentTwo
      );
    });
  });

  test.describe('when splines are drawn with different styles', async () => {
    test('the style must be applied to the splines appropriately', async ({
      page,
    }) => {
      const canvas = await page.locator('canvas');
      const splineStyle = {
        outlineWidthActive: 1.7,
        outlineOpacity: 0.5,
        fillAlpha: 0,
        outlineDashActive: 3,
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
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.splineContourSegmentationTools.splinesOnSegmentTwo
      );
    });
  });
});
