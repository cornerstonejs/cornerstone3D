import { test } from 'playwright-test-coverage';
import {
  visitExample,
  checkForCanvasSnapshot,
  screenShotPaths,
} from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'ultrasoundColors');
});

test.describe('Ultrasound Colors', async () => {
  test('should render the ultrasound colors correctly', async ({ page }) => {
    const totalSlices = 7;

    for (let i = 1; i <= totalSlices; i++) {
      await checkForCanvasSnapshot(
        page,
        '.cornerstone-canvas',
        screenShotPaths.ultrasoundColors[`slice${i}`]
      );

      if (i < totalSlices) {
        await page.getByRole('button', { name: 'Scroll' }).click();
      }
    }
  });
});
