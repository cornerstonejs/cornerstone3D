import type { Page, Locator } from '@playwright/test';
import { test, expect } from 'playwright-test-coverage';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.skip('Rendering Pipelines for GPU', async () => {
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

      // Wait 5 seconds for rendering to complete
      await page.waitForTimeout(5000);

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
      const scalarDataLength = await getScalarDataLength(page);

      expect(scalarDataLength).not.toBe(0);
    });
  }
});

test.skip('Stack Viewport with CPU Rendering', () => {
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

async function getScalarDataLength(page: Page) {
  return page.evaluate(() => {
    const volumes = window.cornerstone.cache.getVolumes();
    const volume = volumes[0];
    const scalarDataLength = volume.voxelManager.getScalarDataLength();
    return scalarDataLength;
  });
}
