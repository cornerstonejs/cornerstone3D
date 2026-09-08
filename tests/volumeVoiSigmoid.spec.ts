import { test, expect } from 'playwright-test-coverage';
import type { Page } from '@playwright/test';
import { visitExample, waitForRenderSettled } from './utils/index';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'volumeVoiSigmoid');
});

/**
 * Grey level of every canvas pixel, read back through a 2D canvas so it works
 * for the WebGL canvases as well.
 */
async function readCanvasGreyLevels(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector(
      '.cornerstone-canvas'
    ) as HTMLCanvasElement;
    const copy = document.createElement('canvas');

    copy.width = canvas.width;
    copy.height = canvas.height;

    const context = copy.getContext('2d');

    context.drawImage(canvas, 0, 0);

    const { data } = context.getImageData(0, 0, copy.width, copy.height);
    const greyLevels: number[] = [];

    for (let index = 0; index < data.length; index += 4) {
      greyLevels.push(data[index]);
    }

    return greyLevels;
  });
}

function meanGreyDifference(a: number[], b: number[]): number {
  expect(a.length).toBe(b.length);
  expect(a.length).toBeGreaterThan(0);

  let total = 0;

  for (let index = 0; index < a.length; index++) {
    total += Math.abs(a[index] - b[index]);
  }

  return total / a.length;
}

test.describe('Sigmoid VOI Volume', async () => {
  test('should render differently for the sigmoid and the linear VOI LUT function.', async ({
    page,
  }) => {
    const label = page.locator('#voiState');

    await expect(label).toHaveText(/LINEAR/);

    const linear = await readCanvasGreyLevels(page);

    await page.getByRole('button', { name: 'Set Sigmoid VOI' }).click();
    await waitForRenderSettled(page);

    await expect(label).toHaveText(/SIGMOID/);

    const sigmoid = await readCanvasGreyLevels(page);

    // Both functions use the same window, so this is purely the difference
    // between the two curves. The example picks a window that clips the lung and
    // the bone with the linear function, where the sigmoid one still has a
    // gradient, which measures at about 11 grey levels on average.
    expect(meanGreyDifference(linear, sigmoid)).toBeGreaterThan(3);

    await page.getByRole('button', { name: 'Set Linear VOI' }).click();
    await waitForRenderSettled(page);

    await expect(label).toHaveText(/LINEAR/);

    // Going back has to restore the linear render rather than leaving the
    // sampled sigmoid curve in place with a rescaled range.
    const linearAgain = await readCanvasGreyLevels(page);

    expect(meanGreyDifference(linear, linearAgain)).toBeLessThan(1);
  });
});
