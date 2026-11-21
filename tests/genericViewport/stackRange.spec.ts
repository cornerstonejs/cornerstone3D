import { expect, test } from '@playwright/test';
import { createExampleUrl } from '../utils/index';

const EXAMPLE = 'stackRange';
const SETTLE_MS = 5000;
const RANGE = { start: 20, end: 30 };

/** Waits until the viewport of the example shows a mode. */
async function waitForMode(page, mode: string) {
  await page.waitForFunction(
    (expected) =>
      window.cornerstone
        .getRenderingEngine('myRenderingEngine')
        ?.getViewport('viewportId')
        ?.getCurrentMode?.() === expected,
    mode,
    { timeout: 60000 }
  );
}

/** Shows a slice of the viewport and waits until it is on display. */
async function goToSlice(page, sliceIndex: number) {
  await page.evaluate(async (imageIndex) => {
    const viewport = window.cornerstone
      .getRenderingEngine('myRenderingEngine')
      .getViewport('viewportId');

    await window.cornerstone.utilities.jumpToSlice(viewport.element, {
      imageIndex,
    });
  }, sliceIndex);
  await page.waitForFunction(
    (imageIndex) =>
      window.cornerstone
        .getRenderingEngine('myRenderingEngine')
        .getViewport('viewportId')
        .getCurrentImageIdIndex() === imageIndex,
    sliceIndex
  );
  await page.waitForTimeout(300);
}

/** The number of annotations that the tools draw on the slice on display. */
function countDrawnAnnotations(page) {
  return page.evaluate(() => {
    const { annotation, utilities } = window.cornerstoneTools;
    const viewport = window.cornerstone
      .getRenderingEngine('myRenderingEngine')
      .getViewport('viewportId');

    return utilities.planar.filterAnnotationsForDisplay(
      viewport,
      annotation.state.getAllAnnotations()
    ).length;
  });
}

test.describe('Stack Range - Next', () => {
  test('shows a key image with a range on the slices of its range in volume mode', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(createExampleUrl(EXAMPLE + '.html').toString());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('div#content');
    await waitForMode(page, 'stack');
    await page.waitForTimeout(SETTLE_MS);

    await page.locator('#View').selectOption('Volume, axial');
    await waitForMode(page, 'volume');
    await page.waitForTimeout(SETTLE_MS);

    await goToSlice(page, RANGE.start);
    await page.getByRole('button', { name: 'Create Key Image' }).click();
    await page.getByRole('button', { name: 'Next Annotation >' }).click();
    await goToSlice(page, RANGE.end);
    await page.getByRole('button', { name: 'End Range' }).click();

    await expect(page.locator('#selection')).toContainText(
      `Range: Frames: ${RANGE.start + 1}-${RANGE.end + 1}`
    );

    const drawn = {};

    for (const sliceIndex of [
      RANGE.start - 1,
      RANGE.start,
      (RANGE.start + RANGE.end) / 2,
      RANGE.end,
      RANGE.end + 1,
    ]) {
      await goToSlice(page, sliceIndex);
      drawn[sliceIndex] = await countDrawnAnnotations(page);
    }

    expect(drawn).toEqual({
      [RANGE.start - 1]: 0,
      [RANGE.start]: 1,
      [(RANGE.start + RANGE.end) / 2]: 1,
      [RANGE.end]: 1,
      [RANGE.end + 1]: 0,
    });
    expect(pageErrors).toEqual([]);
  });
});
