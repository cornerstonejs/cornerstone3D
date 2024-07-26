import { test, Page, Locator, expect } from '@playwright/test';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'renderingPipelines');
});

test.describe('Rendering Pipelines for GPU', async () => {
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
