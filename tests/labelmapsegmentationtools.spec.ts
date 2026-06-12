import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForCanvasSnapshot,
  screenShotPaths,
  simulateClicksOnElement,
  simulateDrawPath,
  setupRenderTracking,
  waitForViewportsRendered,
  waitForRenderSettled,
} from './utils/index';

const VIEWPORT_COUNT = 3;

test.use({ actionTimeout: 30_000 });

const delayBetweenClicks = async (page: any) => {
  await waitForRenderSettled(page);
};

test.beforeEach(async ({ page }) => {
  await setupRenderTracking(page);
  await visitExample(page, 'labelmapSegmentationTools');
  await waitForViewportsRendered(page, VIEWPORT_COUNT);
});

test.describe('Basic manual labelmap Segmentation tools', async () => {
  test('should render and allow usage of circle brush', async ({ page }) => {
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);
    await simulateClicksOnElement({
      locator: firstCanvas,
      points: [
        {
          x: 193,
          y: 273,
        },
        {
          x: 226,
          y: 274,
        },
        {
          x: 195,
          y: 302,
        },
        {
          x: 218,
          y: 301,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: secondCanvas,
      points: [
        {
          x: 226,
          y: 294,
        },
        {
          x: 217,
          y: 324,
        },
        {
          x: 210,
          y: 350,
        },
        {
          x: 199,
          y: 379,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: thirdCanvas,
      points: [
        {
          x: 206,
          y: 258,
        },
        {
          x: 205,
          y: 230,
        },
        {
          x: 203,
          y: 198,
        },
        {
          x: 202,
          y: 165,
        },
      ],
    });
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapSegmentationTools.circularBrush,
      [0, 1, 2],
      { threshold: 0.01, maxDiffPixelRatio: 0.01 }
    );
  });

  test('should render and allow usage of circle eraser', async ({ page }) => {
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await simulateClicksOnElement({
      locator: firstCanvas,
      points: [
        {
          x: 193,
          y: 273,
        },
        {
          x: 226,
          y: 274,
        },
        {
          x: 195,
          y: 302,
        },
        {
          x: 218,
          y: 301,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: secondCanvas,
      points: [
        {
          x: 226,
          y: 294,
        },
        {
          x: 217,
          y: 324,
        },
        {
          x: 210,
          y: 350,
        },
        {
          x: 199,
          y: 379,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: thirdCanvas,
      points: [
        {
          x: 206,
          y: 258,
        },
        {
          x: 205,
          y: 230,
        },
        {
          x: 203,
          y: 198,
        },
        {
          x: 202,
          y: 165,
        },
      ],
    });
    await delayBetweenClicks(page);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'CircularEraser' });
    await simulateClicksOnElement({
      locator: firstCanvas,
      points: [
        {
          x: 193,
          y: 273,
        },
        {
          x: 226,
          y: 274,
        },
        {
          x: 195,
          y: 302,
        },
        {
          x: 218,
          y: 301,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: secondCanvas,
      points: [
        {
          x: 226,
          y: 294,
        },
        {
          x: 217,
          y: 324,
        },
        {
          x: 210,
          y: 350,
        },
        {
          x: 199,
          y: 379,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: thirdCanvas,
      points: [
        {
          x: 206,
          y: 258,
        },
        {
          x: 205,
          y: 230,
        },
        {
          x: 203,
          y: 198,
        },
        {
          x: 202,
          y: 165,
        },
      ],
    });
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapSegmentationTools.circularEraser,
      [0, 1, 2],
      { threshold: 0.01, maxDiffPixelRatio: 0.01 }
    );
  });

  test('should render and allow usage of sphere brush', async ({ page }) => {
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'SphereBrush' });
    await simulateClicksOnElement({
      locator: firstCanvas,
      points: [
        {
          x: 193,
          y: 273,
        },
        {
          x: 226,
          y: 274,
        },
        {
          x: 195,
          y: 302,
        },
        {
          x: 218,
          y: 301,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: secondCanvas,
      points: [
        {
          x: 226,
          y: 294,
        },
        {
          x: 217,
          y: 324,
        },
        {
          x: 210,
          y: 350,
        },
        {
          x: 199,
          y: 379,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: thirdCanvas,
      points: [
        {
          x: 206,
          y: 258,
        },
        {
          x: 205,
          y: 230,
        },
        {
          x: 203,
          y: 198,
        },
        {
          x: 202,
          y: 165,
        },
      ],
    });
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapSegmentationTools.sphereBrush,
      [0, 1, 2],
      { threshold: 0.01, maxDiffPixelRatio: 0.01 }
    );
  });

  test('should render and allow usage of threshold circle', async ({
    page,
  }) => {
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'ThresholdCircle' });
    await page
      .getByRole('combobox')
      .nth(1)
      .selectOption({ label: 'CT Soft Tissue: (-100, 200)' });
    await simulateClicksOnElement({
      locator: firstCanvas,
      points: [
        {
          x: 193,
          y: 273,
        },
        {
          x: 226,
          y: 274,
        },
        {
          x: 195,
          y: 302,
        },
        {
          x: 218,
          y: 301,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: secondCanvas,
      points: [
        {
          x: 226,
          y: 294,
        },
        {
          x: 217,
          y: 324,
        },
        {
          x: 210,
          y: 350,
        },
        {
          x: 199,
          y: 379,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: thirdCanvas,
      points: [
        {
          x: 206,
          y: 258,
        },
        {
          x: 205,
          y: 230,
        },
        {
          x: 203,
          y: 198,
        },
        {
          x: 202,
          y: 165,
        },
      ],
    });
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapSegmentationTools.thresholdCircle,
      [0, 1, 2],
      { threshold: 0.01, maxDiffPixelRatio: 0.01 }
    );
  });

  test('should render and allow usage of rectangle scissor', async ({
    page,
  }) => {
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'RectangleScissor' });
    await waitForRenderSettled(page);

    // Scissor tools need a real mousedown→move→mouseup drag, not separate
    // clicks, so use simulateDrawPath to define each rectangle.
    await simulateDrawPath(page, firstCanvas, [
      [190, 270],
      [230, 320],
    ]);
    await delayBetweenClicks(page);

    await simulateDrawPath(page, secondCanvas, [
      [226, 294],
      [260, 340],
    ]);
    await delayBetweenClicks(page);

    await simulateDrawPath(page, thirdCanvas, [
      [206, 258],
      [240, 300],
    ]);

    await waitForRenderSettled(page);
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapSegmentationTools.rectangleScissor,
      [0, 1, 2],
      { threshold: 0.01, maxDiffPixelRatio: 0.01 }
    );
  });

  test('should render and allow usage of circle scissor', async ({ page }) => {
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'CircleScissor' });
    await waitForRenderSettled(page);

    await simulateDrawPath(page, firstCanvas, [
      [290, 270],
      [330, 320],
    ]);
    await delayBetweenClicks(page);

    await simulateDrawPath(page, secondCanvas, [
      [190, 270],
      [230, 320],
    ]);
    await delayBetweenClicks(page);

    await simulateDrawPath(page, thirdCanvas, [
      [190, 270],
      [230, 320],
    ]);

    await waitForRenderSettled(page);
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapSegmentationTools.circleScissor,
      [0, 1, 2],
      { threshold: 0.01, maxDiffPixelRatio: 0.01 }
    );
  });

  test('should render and allow usage of sephere scissor', async ({ page }) => {
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'SphereScissor' });
    await waitForRenderSettled(page);

    await simulateDrawPath(page, firstCanvas, [
      [190, 270],
      [230, 320],
    ]);
    await delayBetweenClicks(page);

    await simulateDrawPath(page, secondCanvas, [
      [226, 294],
      [260, 340],
    ]);
    await delayBetweenClicks(page);

    await simulateDrawPath(page, thirdCanvas, [
      [206, 258],
      [240, 300],
    ]);

    await waitForRenderSettled(page);
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapSegmentationTools.sphereScissor,
      [0, 1, 2],
      { threshold: 0.01, maxDiffPixelRatio: 0.01 }
    );
  });

  test('should render and allow usage of eraser scissor', async ({ page }) => {
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'SphereScissor' });
    await waitForRenderSettled(page);

    await simulateDrawPath(page, firstCanvas, [
      [190, 270],
      [230, 320],
    ]);
    await delayBetweenClicks(page);

    await simulateDrawPath(page, secondCanvas, [
      [226, 294],
      [260, 340],
    ]);
    await delayBetweenClicks(page);

    await simulateDrawPath(page, thirdCanvas, [
      [206, 258],
      [240, 300],
    ]);
    await delayBetweenClicks(page);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'ScissorsEraser' });
    await waitForRenderSettled(page);

    await simulateDrawPath(page, firstCanvas, [
      [190, 270],
      [230, 320],
    ]);
    await delayBetweenClicks(page);

    await simulateDrawPath(page, secondCanvas, [
      [226, 294],
      [260, 340],
    ]);
    await delayBetweenClicks(page);

    await simulateDrawPath(page, thirdCanvas, [
      [206, 258],
      [240, 300],
    ]);

    await waitForRenderSettled(page);
    await checkForCanvasSnapshot(
      page,
      '',
      screenShotPaths.labelmapSegmentationTools.scissorEraser,
      [0, 1, 2],
      { threshold: 0.01, maxDiffPixelRatio: 0.01 }
    );
  });

  // test('should render and allow usage of paint fill', async ({ page }) => {
  //   const screenshotLocator = page.locator('#content > div');
  //   const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
  //   const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
  //   const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

  //   await page
  //     .getByRole('combobox')
  //     .first()
  //     .selectOption({ label: 'PaintFill' });
  //   await simulateClicksOnElement({
  //     locator: firstCanvas,
  //     points: [
  //       {
  //         x: 209,
  //         y: 268,
  //       },
  //     ],
  //   });
  //   await delayBetweenClicks(page);
  //   await simulateClicksOnElement({
  //     locator: secondCanvas,
  //     points: [
  //       {
  //         x: 224,
  //         y: 354,
  //       },
  //     ],
  //   });
  //   await delayBetweenClicks(page);
  //   await simulateClicksOnElement({
  //     locator: thirdCanvas,
  //     points: [
  //       {
  //         x: 309,
  //         y: 331,
  //       },
  //     ],
  //   });

  //   await checkForScreenshot(
  //     page,
  //     screenshotLocator,
  //     screenShotPaths.labelmapSegmentationTools.paintFill2
  //   );
  // });
});
