import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
  simulateClicksOnElement,
} from './utils/index';

const delayBetweenClicks = async (page: any) => {
  await page.waitForTimeout(1500);
};

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'labelmapSegmentationTools', 10000);
});

test.describe('Basic manual labelmap Segmentation tools', async () => {
  test('should render and allow usage of circle brush', async ({ page }) => {
    const screenshotLocator = page.locator('#content > div');
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
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.labelmapSegmentationTools.circularBrush
    );
  });

  test('should render and allow usage of circle eraser', async ({ page }) => {
    const screenshotLocator = page.locator('#content > div');
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
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.labelmapSegmentationTools.circularEraser
    );
  });

  test('should render and allow usage of sphere brush', async ({ page }) => {
    const screenshotLocator = page.locator('#content > div');
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
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.labelmapSegmentationTools.sphereBrush
    );
  });

  test('should render and allow usage of sphere eraser', async ({ page }) => {
    const screenshotLocator = page.locator('#content > div');
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
    await delayBetweenClicks(page);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'SphereEraser' });
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
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.labelmapSegmentationTools.sphereEraser
    );
  });

  test('should render and allow usage of threshold circle', async ({
    page,
  }) => {
    const screenshotLocator = page.locator('#content > div');
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
      .selectOption({ label: 'CT Bone: (200, 1000)' });
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
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.labelmapSegmentationTools.thresholdCircle
    );
  });

  test('should render and allow usage of rectangle scissor', async ({
    page,
  }) => {
    const screenshotLocator = page.locator('#content > div');
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'RectangleScissor' });

    await simulateClicksOnElement({
      locator: firstCanvas,
      points: [
        {
          x: 190,
          y: 270,
        },
        {
          x: 230,
          y: 320,
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
          x: 260,
          y: 340,
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
          x: 240,
          y: 300,
        },
      ],
    });

    await page.waitForTimeout(3000);
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.labelmapSegmentationTools.rectangleScissor
    );
  });

  test('should render and allow usage of circle scissor', async ({ page }) => {
    const screenshotLocator = page.locator('#content > div');
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'CircleScissor' });
    await simulateClicksOnElement({
      locator: firstCanvas,
      points: [
        {
          x: 290,
          y: 270,
        },
        {
          x: 330,
          y: 320,
        },
      ],
    });
    await delayBetweenClicks(page);
    await simulateClicksOnElement({
      locator: secondCanvas,
      points: [
        {
          x: 190,
          y: 270,
        },
        {
          x: 230,
          y: 320,
        },
      ],
    });
    await delayBetweenClicks(page);

    await simulateClicksOnElement({
      locator: thirdCanvas,
      points: [
        {
          x: 190,
          y: 270,
        },
        {
          x: 230,
          y: 320,
        },
      ],
    });

    await page.waitForTimeout(3000);
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.labelmapSegmentationTools.circleScissor
    );
  });

  test('should render and allow usage of sephere scissor', async ({ page }) => {
    const screenshotLocator = page.locator('#content > div');
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'SphereScissor' });
    await simulateClicksOnElement({
      locator: firstCanvas,
      points: [
        {
          x: 190,
          y: 270,
        },
        {
          x: 230,
          y: 320,
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
          x: 260,
          y: 340,
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
          x: 240,
          y: 300,
        },
      ],
    });
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.labelmapSegmentationTools.sphereScissor
    );
  });

  test('should render and allow usage of eraser scissor', async ({ page }) => {
    const screenshotLocator = page.locator('#content > div');
    const firstCanvas = page.locator('.cornerstone-canvas').nth(0);
    const secondCanvas = page.locator('.cornerstone-canvas').nth(1);
    const thirdCanvas = page.locator('.cornerstone-canvas').nth(2);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'SphereScissor' });
    await simulateClicksOnElement({
      locator: firstCanvas,
      points: [
        {
          x: 190,
          y: 270,
        },
        {
          x: 230,
          y: 320,
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
          x: 260,
          y: 340,
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
          x: 240,
          y: 300,
        },
      ],
    });
    await delayBetweenClicks(page);

    await page
      .getByRole('combobox')
      .first()
      .selectOption({ label: 'ScissorsEraser' });
    await simulateClicksOnElement({
      locator: firstCanvas,
      points: [
        {
          x: 190,
          y: 270,
        },
        {
          x: 230,
          y: 320,
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
          x: 260,
          y: 340,
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
          x: 240,
          y: 300,
        },
      ],
    });
    await checkForScreenshot(
      page,
      screenshotLocator,
      screenShotPaths.labelmapSegmentationTools.scissorEraser
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
