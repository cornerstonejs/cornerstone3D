import { test } from 'playwright-test-coverage';
import type { Page, Locator } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'interpolationContourSegmentation');
});

test.describe('Contour Freehand Annotation Tool', async () => {
  test('should draw a spline contour segmentation when SplineContourSegmentationTool is selected', async ({
    page,
  }) => {
    const canvas = await page.locator('canvas.cornerstone-canvas').first();

    await drawSplineContourSegmentationTool({
      page,
      canvas,
      segmentIndex: undefined,
    });

    // Wait 5 seconds for rendering to complete
    await page.waitForTimeout(5000);

    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.interpolationContourSegmentation.splineContourSegmentationTool
    );
  });

});

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

async function drawSplineContourSegmentationTool({
  page,
  canvas,
  segmentIndex,
}: {
  page: Page;
  canvas: Locator;
  segmentIndex: number | undefined;
}) {
  await page.getByRole('combobox').nth(1).selectOption('SplineContourSegmentationTool');

  const points = [
    [94,246],
    [128,252],
    [149,265],
    [150,279],
    [146,294],
    [144,306],
    [156,302],
    [182,313],
    [184,324],
    [197,334],
    [209,357],
    [212,409],
    [179,449],
    [146,463],
    [129,452],
    [110,446],
    [72,439],
    [55,428],
    [46,416],
    [35,411],
    [23,396],
    [7,349],
    [9,308],
    [15,264],
    [36,242],
    [63,239],
    [94,245]
  ];

  await drawSpline({ page, canvas, points, segmentIndex });
}
