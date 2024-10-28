import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  simulateDrawPath,
} from './utils/index';
import pause from './utils/pause';
import locatorToPageCoord from './utils/locatorToPageCoord';

const SEG1_OUTERCIRCLE_POINT = [210, 235];

const rightArmBoneContour = [
  [100, 197],
  [98, 221],
  [115, 233],
  [129, 232],
  [129, 207],
  [118, 194],
];

const leftArmContour = [
  [433, 167],
  [432, 172],
  [439, 219],
  [424, 258],
  [376, 263],
  [348, 252],
  [342, 223],
  [365, 200],
  [363, 181],
  [352, 164],
  [356, 144],
  [371, 116],
  [390, 93],
];

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackSegmentation');
});

test.describe('Stack Segmentation', async () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('slider').fill('5');
  });

  test('should load the segmentation on a stack viewport', async ({ page }) => {
    const canvas = await page.locator('canvas');

    await checkForScreenshot(
      page,
      canvas,
      screenShotPaths.stackSegmentation.defaultSegmentation
    );
  });

  test.describe('when circular brush tool is selected', async () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('combobox').first().selectOption('CircularBrush');
    });

    test('should draw a new segment', async ({ page }) => {
      const canvas = await page.locator('canvas');

      await simulateDrawPath(page, canvas, rightArmBoneContour, {
        interpolateSteps: true,
        closePath: true,
      });

      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.stackSegmentation.circularBrushSegment1
      );
    });
  });

  test.describe('when circular eraser tool is selected', async () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('combobox').first().selectOption('CircularEraser');
    });

    test.describe('and segmentation 1 that has segments is active', async () => {
      test('should erase the pixels from both circular segments', async ({
        page,
      }) => {
        const canvas = await page.locator('canvas');

        await eraseVerticalLine(page, canvas);
        await checkForScreenshot(
          page,
          canvas,
          screenShotPaths.stackSegmentation.circularEraserSegmentation1
        );
      });
    });

    test.describe('and it is on a segmentation 2 that has no segments', async () => {
      test('should not erase the pixels from segmentation 1', async ({
        page,
      }) => {
        await page
          .getByRole('button', { name: 'Create New Segmentation on' })
          .click();

        const canvas = await page.locator('canvas');

        await eraseVerticalLine(page, canvas);
        await checkForScreenshot(
          page,
          canvas,
          screenShotPaths.stackSegmentation.circularEraserSegmentation2
        );
      });
    });
  });

  test.describe('when threshold brush tool is selected', async () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('combobox').first().selectOption('ThresholdBrush');
      await page.getByRole('slider').fill('25');
    });

    test('should paint the expected pixels based on the initial pixel value', async ({
      page,
    }) => {
      const canvas = await page.locator('canvas');

      await simulateDrawPath(page, canvas, leftArmContour, {
        interpolateSteps: true,
        closePath: true,
      });

      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.stackSegmentation.thresholdBrushSegment1
      );
    });
  });

  test.describe('when dynamic threshold tool is selected', async () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('combobox').first().selectOption('DynamicThreshold');
      await page.getByRole('slider').fill('25');
    });

    test.describe('and the mouse stays at the same location for a few ms', async () => {
      test('should highlight some pixels based on the pixel values at the mouse cursor', async ({
        page,
      }) => {
        const canvas = await page.locator('canvas');
        const canvasPoint = leftArmContour[0];
        const pagePoint = await locatorToPageCoord(canvas, canvasPoint);

        await page.mouse.move(pagePoint[0], pagePoint[1]);
        await pause(1000);

        await checkForScreenshot(
          page,
          canvas,
          screenShotPaths.stackSegmentation
            .dynamicThresholdInitialHighlightedPixels
        );
      });
    });

    test.describe('and the mouse is moved around with left button held down', async () => {
      test.beforeEach(async ({ page }) => {
        const canvas = await page.locator('canvas');

        await simulateDrawPath(page, canvas, leftArmContour, {
          interpolateSteps: true,
        });
      });

      test('should highlight all pixels that are within the threshold', async ({
        page,
      }) => {
        const canvas = await page.locator('canvas');

        await checkForScreenshot(
          page,
          canvas,
          screenShotPaths.stackSegmentation.dynamicThresholdHighlightedContour
        );
      });

      test.describe('and the <ENTER> key is pressed', async () => {
        test('should accept the pixels selected', async ({ page }) => {
          const canvas = await page.locator('canvas');

          page.keyboard.press('Enter');

          await checkForScreenshot(
            page,
            canvas,
            screenShotPaths.stackSegmentation.dynamicThresholdConfirmedContour
          );
        });
      });
    });
  });

  test.describe('when rectangle scissor tool is selected', async () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('combobox').first().selectOption('RectangleScissor');
    });

    test.describe('and segmentation 1 that has segments is active', async () => {
      test('should fill the pixels within the rectangular region selected on segmentation 1', async ({
        page,
      }) => {
        const canvas = await page.locator('canvas');

        await drawRectangleScissor(page, canvas);
        await checkForScreenshot(
          page,
          canvas,
          screenShotPaths.stackSegmentation.rectangleScissorSegmentation1
        );
      });
    });

    test.describe('and it is on a segmentation 2 that has no segments', async () => {
      test('should fill the pixels within the rectangular region selected on segmentation 2 preserving the segments on segmentation 1', async ({
        page,
      }) => {
        const canvas = await page.locator('canvas');

        await page
          .getByRole('button', { name: 'Create New Segmentation on' })
          .click();

        await drawRectangleScissor(page, canvas);
        await checkForScreenshot(
          page,
          canvas,
          screenShotPaths.stackSegmentation.rectangleScissorSegmentation1
        );
      });
    });
  });

  test.describe('when circular scissor tool is selected', async () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('combobox').first().selectOption('CircleScissor');
    });

    test.describe('and segmentation 1 that has segments is active', async () => {
      test('should fill the pixels within the circular region selected on segmentation 1', async ({
        page,
      }) => {
        const canvas = await page.locator('canvas');

        await drawCircleScissor(page, canvas);
        await checkForScreenshot(
          page,
          canvas,
          screenShotPaths.stackSegmentation.circularScissorSegmentation1
        );
      });
    });

    test.describe('and it is on a segmentation 2 that has no segments', async () => {
      test('should fill the pixels within the circular region selected on segmentation 2 preserving the segments on segmentation 1', async ({
        page,
      }) => {
        const canvas = await page.locator('canvas');

        await page
          .getByRole('button', { name: 'Create New Segmentation on' })
          .click();

        await drawCircleScissor(page, canvas);
        await checkForScreenshot(
          page,
          canvas,
          screenShotPaths.stackSegmentation.circularScissorSegmentation2
        );
      });
    });
  });

  test.describe('when paint fill tool is selected', async () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('combobox').first().selectOption('PaintFill');
    });

    test.describe('and user clicks on the outer circle', async () => {
      test('should fill the outer circle', async ({ page }) => {
        const canvas = await page.locator('canvas');

        await runPaintFill(page, canvas, SEG1_OUTERCIRCLE_POINT);
        await checkForScreenshot(
          page,
          canvas,
          screenShotPaths.stackSegmentation.paintFillSeg1OuterCircle
        );
      });
    });

    test.describe('and a new segmentation is created', async () => {
      test.describe('and user clicks on the outer circle', async () => {
        test('should paint the entire image over the previous segmetantion', async ({
          page,
        }) => {
          const canvas = await page.locator('canvas');

          await page
            .getByRole('button', { name: 'Create New Segmentation on' })
            .click();

          await runPaintFill(page, canvas, SEG1_OUTERCIRCLE_POINT);
          await checkForScreenshot(
            page,
            canvas,
            screenShotPaths.stackSegmentation.paintFillSegmentation2
          );
        });
      });
    });
  });
});

async function runPaintFill(page, canvas, clickPoint: number[]) {
  const pageCoord = await locatorToPageCoord(canvas, clickPoint);
  const toolsDropdown = await page.getByRole('combobox').first();
  const selectedToolOption = await toolsDropdown.inputValue();

  await toolsDropdown.selectOption('PaintFill');

  await page.mouse.move(pageCoord[0], pageCoord[1]);
  await page.mouse.down();
  await pause(500); // Should wait for >300ms
  await page.mouse.up();

  // Restore it to its previous selected value
  await toolsDropdown.selectOption(selectedToolOption);
}

async function eraseVerticalLine(page, canvas) {
  const toolsDropdown = await page.getByRole('combobox').first();
  const selectedToolOption = await toolsDropdown.inputValue();

  await toolsDropdown.selectOption('CircularEraser');

  const width = Number(await canvas.getAttribute('width'));
  const height = Number(await canvas.getAttribute('height'));

  // Draws a centered vertical line that crosses the two circular segments
  const startPoint = [Math.round(width / 2), 3 * Math.round(height / 8)];
  const endPoint = [Math.round(width / 2), 5 * Math.round(height / 8)];

  await simulateDrawPath(page, canvas, [startPoint, endPoint], {
    interpolateSteps: true,
  });

  // Restore it to its previous selected value
  await toolsDropdown.selectOption(selectedToolOption);
}

async function drawCircleScissor(page, canvas) {
  const toolsDropdown = await page.getByRole('combobox').first();
  const selectedToolOption = await toolsDropdown.inputValue();

  await toolsDropdown.selectOption('CircleScissor');

  const width = Number(await canvas.getAttribute('width'));
  const height = Number(await canvas.getAttribute('height'));
  const circleCenterPoint = [Math.round(width / 2), Math.round(height / 3)];
  const circleBorderPoint = [circleCenterPoint[0] + 60, circleCenterPoint[1]];
  const circlePoints = [circleCenterPoint, circleBorderPoint];

  await simulateDrawPath(page, canvas, circlePoints);

  // Restore it to its previous selected value
  await toolsDropdown.selectOption(selectedToolOption);
}

async function drawRectangleScissor(page, canvas) {
  const toolsDropdown = await page.getByRole('combobox').first();
  const selectedToolOption = await toolsDropdown.inputValue();

  await toolsDropdown.selectOption('RectangleScissor');

  const width = Number(await canvas.getAttribute('width'));
  const height = Number(await canvas.getAttribute('height'));
  const rectTopLeftPoint = [Math.round(width / 3), Math.round(height / 3)];
  const rectBottomRightPoint = [
    2 * Math.round(width / 3),
    Math.round(height / 2),
  ];
  const rectPoints = [rectTopLeftPoint, rectBottomRightPoint];

  await simulateDrawPath(page, canvas, rectPoints);

  // Restore it to its previous selected value
  await toolsDropdown.selectOption(selectedToolOption);
}
