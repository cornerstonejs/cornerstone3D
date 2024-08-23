import { test, Page, Locator, expect } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.describe('Rendering Pipelines for GPU', async () => {
  test.beforeEach(async ({ page }) => {
    await visitExample(page, 'renderingPipelines');
  });

  const renderingOptions = [
    { name: 'Prefer size over accuracy', key: 'preferSizeOverAccuracy' },
    { name: 'Use norm 16 texture', key: 'norm16Texture' },
  ];

  for (const option of renderingOptions) {
    test(`should correctly display data with ${option.name}`, async ({
      page,
    }) => {
      await selectRenderingOption(page, option.name);

      const canvases = await getCanvases(page);

      for (let i = 0; i < canvases.length; i++) {
        await checkForScreenshot(
          page,
          canvases[i],
          screenShotPaths.renderingPipelines[`${option.key}${i + 1}`]
        );
      }
    });

    test(`should correctly display data with ${option.name} with correct scalings`, async ({
      page,
    }) => {
      await selectRenderingOption(page, option.name);
      await waitForRenderingAndAddEllipse(page);

      const annotation = await getAnnotation(page);
      const dataType = await getDataType(page);

      expect(dataType).not.toBe('Float32Array');

      const stats = Object.values(annotation.data.cachedStats)[0];
      expectMeanInRange(stats.mean);
    });
  }
});

test.describe('Stack Viewport with CPU Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await visitExample(page, 'renderingPipelinesCPU');
  });

  test('should correctly render using CPU and handle annotations', async ({
    page,
  }) => {
    // Switch to CPU rendering
    await selectRenderingOption(page, 'CPU Rendering');
    await page.waitForTimeout(1000); // Wait for re-rendering

    // Check CPU rendering
    await checkCPURendering(page);

    // Add an elliptical ROI and wait for rendering
    await waitForRenderingAndAddEllipse(page);
    // wait 2 seconds
    await page.waitForTimeout(2000);
    // Verify annotation stats
    await verifyAnnotationStats(page);
  });
});

async function checkCPURendering(page: Page) {
  const isUsingCPU = await page.evaluate(() => {
    return window.cornerstone.getShouldUseCPURendering();
  });
  expect(isUsingCPU).toBe(true);

  const canvas = await page.locator('canvas').first();
  await checkForScreenshot(
    page,
    canvas,
    screenShotPaths.renderingPipelinesCPU.cpuRendering
  );
}

async function selectRenderingOption(page: Page, optionName: string) {
  await page.getByRole('combobox').selectOption(optionName);
}

async function getCanvases(page: Page): Promise<Locator[]> {
  return [
    await page.locator('canvas').first(),
    await page.locator('canvas').last(),
  ];
}

async function waitForRenderingAndAddEllipse(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const canvas = await page.locator('canvas').first();
  await canvas.click({ position: { x: 58, y: 49 } });
  await canvas.click({ position: { x: 75, y: 63 } });

  // render
  await page.evaluate(() => {
    window.cornerstone.getRenderingEngines()[0].render();
  });
}

async function getAnnotation(page: Page) {
  return page.evaluate(() => {
    return window.cornerstoneTools.annotation.state.getAllAnnotations()[0];
  });
}

async function getDataType(page: Page) {
  return page.evaluate(() => {
    const volumes = window.cornerstone.cache.getVolumes();
    const volume = volumes[0];
    const scalarData = volume.getScalarData();
    return scalarData.dataType;
  });
}

function expectMeanInRange(mean: number) {
  expect(mean).toBeGreaterThan(-3100);
  expect(mean).toBeLessThan(-3000);
}

async function verifyAnnotationStats(page: Page) {
  const annotation = await getAnnotation(page);
  const stats = Object.values(annotation.data.cachedStats)[0];
  expectMeanInRange(stats.mean);
}
