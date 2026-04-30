import { test } from 'playwright-test-coverage';
import {
  checkForScreenshot,
  visitExample,
  screenShotPaths,
} from './utils/index';

async function setRangeValue(page, selector: string, value: string) {
  await page.locator(selector).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = nextValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'labelmapGlobalConfiguration');

  // Make sure it will always work even if someone updates the example page
  await setRangeValue(page, '#outlineWidthActive', '3');
  await setRangeValue(page, '#outlineAlphaActive', '100');
  await setRangeValue(page, '#outlineWidthInactive', '2');
  await setRangeValue(page, '#fillAlphaActive', '70');
  await setRangeValue(page, '#fillAlphaInactive', '70');
});

test.describe('Labelmap Global Configuration', async () => {
  test.describe('when no changes are made', async () => {
    test('should render the segmentations using the default global configuration', async ({
      page,
    }) => {
      const canvas = await page.locator('canvas.cornerstone-canvas');

      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.labelmapGlobalConfiguration.defaultGlobalConfig
      );
    });
  });

  test.describe('when toggling inactive segmentations', async () => {
    test('should hide the inactive segmentation', async ({ page }) => {
      const canvas = await page.locator('canvas.cornerstone-canvas');

      await page
        .getByRole('button', { name: 'toggle render inactive' })
        .click();

      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.labelmapGlobalConfiguration.toggleInactiveSegmentation
      );
    });
  });

  test.describe('when toggling outline rendering', async () => {
    test('should render segmentations with no outline', async ({ page }) => {
      const canvas = await page.locator('canvas.cornerstone-canvas');

      await page
        .getByRole('button', { name: 'toggle outline rendering' })
        .click();

      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.labelmapGlobalConfiguration.toggleOutlineRendering
      );
    });
  });

  test.describe('when toggling fill rendering', async () => {
    test('should not fill the active segmentation', async ({ page }) => {
      const canvas = await page.locator('canvas.cornerstone-canvas');

      await page.getByRole('button', { name: 'toggle fill rendering' }).click();
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.labelmapGlobalConfiguration.toggleFillRendering
      );
    });
  });

  test.describe('when changing the outline width for the active segmentation', async () => {
    test('should render the active segmentation with the new outline width', async ({
      page,
    }) => {
      const canvas = await page.locator('canvas.cornerstone-canvas');

      await setRangeValue(page, '#outlineWidthActive', '5');
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.labelmapGlobalConfiguration.outlineWidthActive
      );
    });
  });

  test.describe('when changing the outline alpha for the active segmentation', async () => {
    test('should render the active segmentation with the new outline alpha', async ({
      page,
    }) => {
      const canvas = await page.locator('canvas.cornerstone-canvas');

      await setRangeValue(page, '#outlineWidthActive', '5');
      await setRangeValue(page, '#outlineAlphaActive', '0');
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.labelmapGlobalConfiguration.outlineAlphaActive
      );
    });
  });

  test.describe('when changing the outline width for the inactive segmentation', async () => {
    test('should render the inactive segmentation with the new outline width', async ({
      page,
    }) => {
      const canvas = await page.locator('canvas.cornerstone-canvas');

      await setRangeValue(page, '#outlineWidthInactive', '5');
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.labelmapGlobalConfiguration.outlineWidthInactive
      );
    });
  });

  test.describe('when changing the fill alpha for the active segmentation', async () => {
    test('should render the active segmentation with the new fill alpha', async ({
      page,
    }) => {
      const canvas = await page.locator('canvas.cornerstone-canvas');

      await setRangeValue(page, '#fillAlphaActive', '25');
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.labelmapGlobalConfiguration.fillAlphaActive
      );
    });
  });

  test.describe('when changing the fill alpha for the inactive segmentation', async () => {
    test('should render the inactive segmentation with the new fill alpha', async ({
      page,
    }) => {
      const canvas = await page.locator('canvas.cornerstone-canvas');

      await setRangeValue(page, '#fillAlphaInactive', '20');
      await checkForScreenshot(
        page,
        canvas,
        screenShotPaths.labelmapGlobalConfiguration.fillAlphaInactive
      );
    });
  });
});
