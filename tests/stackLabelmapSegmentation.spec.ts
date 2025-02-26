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

const leftArmBoneContour = [
  [403, 150],
  [410, 169],
  [396, 194],
  [386, 181],
  [391, 157],
];

// Common setup for all tests
test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stacklabelmapsegmentation');
});

// Test for circular brush tool
test('Stack Segmentation - Circular Brush Tool', async ({ page }) => {
  await page.getByRole('combobox').first().selectOption('CircularBrush');

  const canvas = await page.locator('canvas').first();

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

// Test for circular eraser tool with segmentation 1
test('Stack Segmentation - Circular Eraser Tool with segmentation 1', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('CircularBrush');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, rightArmBoneContour, {
    interpolateSteps: true,
    closePath: true,
  });

  await page.getByRole('combobox').first().selectOption('CircularEraser');

  await simulateDrawPath(
    page,
    canvas,
    [
      [100, 197],
      [98, 221],
      [115, 233],
    ],
    {
      interpolateSteps: true,
      closePath: true,
    }
  );

  // await eraseVerticalLine(page, canvas);
  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.circularEraserSegmentation1
  );
});

// Test for circular eraser tool with segmentation 2
test('Stack Segmentation - Circular Eraser Tool with segmentation 2', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('CircularBrush');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, [...rightArmBoneContour, [120, 150]], {
    interpolateSteps: true,
    closePath: true,
  });

  await page
    .getByRole('button', { name: 'Create New Segmentation on' })
    .click();

  await simulateDrawPath(page, canvas, rightArmBoneContour, {
    interpolateSteps: true,
    closePath: true,
  });
  await page.getByRole('combobox').first().selectOption('CircularEraser');

  await simulateDrawPath(
    page,
    canvas,
    [
      [100, 197],
      [98, 221],
      [115, 233],
    ],
    {
      interpolateSteps: true,
      closePath: true,
    }
  );

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.circularEraserSegmentation2
  );
});

// Test for threshold brush tool with CT Fat
test('Stack Segmentation - Threshold Brush Tool with CT Fat', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('ThresholdBrush');
  await page.getByRole('slider').fill('25');

  const canvas = await page.locator('canvas').first();

  await page.locator('#thresholdDropdown').selectOption('CT Fat: (-150, -70)');

  await simulateDrawPath(page, canvas, leftArmContour, {
    interpolateSteps: true,
    closePath: true,
  });

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.thresholdBrushFatSegment1
  );
});

// Test for threshold brush tool with CT Bone
test('Stack Segmentation - Threshold Brush Tool with CT Bone', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('ThresholdBrush');
  await page.getByRole('slider').fill('25');

  const canvas = await page.locator('canvas').first();

  await page.locator('#thresholdDropdown').selectOption('CT Bone: (200, 1000)');

  await simulateDrawPath(page, canvas, leftArmBoneContour, {
    interpolateSteps: true,
    closePath: true,
  });

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.thresholdBrushBoneSegment1
  );
});

// Test for dynamic threshold tool - initial highlight
test('Stack Segmentation - Dynamic Threshold Tool - Initial Highlight', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('DynamicThreshold');
  await page.getByRole('slider').fill('25');

  const canvas = await page.locator('canvas').first();
  const canvasPoint = leftArmContour[0];
  const pagePoint = await locatorToPageCoord(canvas, canvasPoint);

  await page.mouse.move(pagePoint[0], pagePoint[1]);
  await pause(1000);

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.dynamicThresholdInitialHighlightedPixels
  );
});

// Test for dynamic threshold tool - highlight contour
test('Stack Segmentation - Dynamic Threshold Tool - Highlight Contour', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('DynamicThreshold');
  await page.getByRole('slider').fill('25');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, leftArmContour, {
    interpolateSteps: true,
  });

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.dynamicThresholdHighlightedContour
  );
});

// Test for dynamic threshold tool - confirm contour
test('Stack Segmentation - Dynamic Threshold Tool - Confirm Contour', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('DynamicThreshold');
  await page.getByRole('slider').fill('25');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, leftArmContour, {
    interpolateSteps: true,
  });

  page.keyboard.press('Enter');

  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.dynamicThresholdConfirmedContour
  );
});

// Test for rectangle scissor tool with segmentation 1
test('Stack Segmentation - Sphere Brush Tool', async ({ page }) => {
  await page.getByRole('combobox').first().selectOption('SphereBrush');

  const canvas = await page.locator('canvas').first();

  await simulateDrawPath(page, canvas, rightArmBoneContour, {
    interpolateSteps: true,
    closePath: true,
  });

  const secondViewport = await page.locator('canvas').nth(1);

  await page.evaluate(() => {
    // Access cornerstone directly from the window object
    const cornerstone = window.cornerstone;
    if (!cornerstone) {
      return;
    }

    const enabledElements = cornerstone.getEnabledElements();
    if (enabledElements.length === 0) {
      return;
    }

    const viewport = enabledElements[1].viewport;
    if (viewport) {
      viewport.setImageIdIndex(1);
      viewport.render();
    }
  });

  await page.waitForTimeout(1000);

  await checkForScreenshot(
    page,
    secondViewport,
    screenShotPaths.stackSegmentation.sphereBrushSecondViewport
  );
});

// Test for rectangle scissor tool with segmentation 2
test('Stack Segmentation - Rectangle Scissor Tool with segmentation 2', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('RectangleScissor');

  const canvas = await page.locator('canvas').first();

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

// Test for circular scissor tool with segmentation 1
test('Stack Segmentation - Circular Scissor Tool with segmentation 1', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('CircleScissor');

  const canvas = await page.locator('canvas').first();

  await drawCircleScissor(page, canvas);
  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.circularScissorSegmentation1
  );
});

// Test for paint fill tool with outer circle
test('Stack Segmentation - Paint Fill Tool with outer circle', async ({
  page,
}) => {
  await page.getByRole('combobox').first().selectOption('PaintFill');

  const canvas = await page.locator('canvas').first();

  await runPaintFill(page, canvas, SEG1_OUTERCIRCLE_POINT);
  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.stackSegmentation.paintFillSeg1OuterCircle
  );
});

// Helper functions
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
