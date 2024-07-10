import { test } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
  simulateDrawPath,
} from './utils/index';
import pause from './utils/pause';
import locatorToPageCoord from './utils/locatorToPageCoord';
import simulateDrawRect from './utils/simulateDrawRect';

const SEG1_OUTERCIRCLE_POINT = [210, 235];

const segmentPoints1 = [
  [100, 197],
  [98, 221],
  [115, 233],
  [129, 232],
  [129, 207],
  [118, 194],
];

const segmentPoints2 = [
  [397, 142],
  [384, 171],
  [391, 202],
  [411, 181],
  [414, 152],
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

      await simulateDrawPath(page, canvas, segmentPoints1, {
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

    test.describe('and it is on a segmentation 1 that has segments', async () => {
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

  test.describe('when rectangle scissor tool is selected', async () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('combobox').first().selectOption('RectangleScissor');
    });

    test.describe('and it is on a segmentation 1 that has segments', async () => {
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
      test('should fill the pixels within the rectangular region selected on segmentation 2', async ({
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

  test.describe('when paint fill tool is selected', async () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('combobox').first().selectOption('PaintFill');
    });

    test.describe('and clicking on the outer circle', async () => {
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

    test.describe('and creating a new segmentation', async () => {
      test.describe('and clicking on the outer circle', async () => {
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
  const pageCoord = await locatorToPageCoord(page, canvas, clickPoint);
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

  await simulateDrawRect(page, canvas, rectTopLeftPoint, rectBottomRightPoint);

  // Restore it to its previous selected value
  await toolsDropdown.selectOption(selectedToolOption);
}
