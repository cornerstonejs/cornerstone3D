import { test, expect } from 'playwright-test-coverage';
import {
  visitExample,
  simulateClicksOnElement,
  getVisibleViewportCanvas,
} from './utils/index';

const CT_VOLUME_ID = 'cornerstoneStreamingImageVolume:CT_VOLUME_ID';

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'rectangleROIStartEndThresholdWithSegmentation');
});

/**
 * The "CT + PT fusion" view of the example adds the CT volume before the PT
 * volume, so the CT volume is the default measurement target of the viewport.
 * The tool configures `targetsFilter` with `forModality('PT')`, so the
 * statistics must still come from the PT volume.
 */
test('measures the PT volume on the CT + PT fusion view', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const getActorIds = () =>
    page.evaluate(() =>
      window.cornerstone
        .getEnabledElementByViewportId('PT_AXIAL')
        .viewport.getActors()
        .map((actor) => actor.referencedId ?? actor.uid)
    );

  await page.getByRole('combobox').first().selectOption('CT + PT fusion');

  // Wait for the CT volume of the fusion view to arrive.
  await expect.poll(getActorIds, { timeout: 60000 }).toContain(CT_VOLUME_ID);

  // The CT volume is first, so it is the default target of the viewport, and
  // the tool has to override that default to measure the PT volume.
  const actorIds = await getActorIds();
  expect(actorIds[0]).toBe(CT_VOLUME_ID);
  expect(
    await page.evaluate(() =>
      window.cornerstone
        .getEnabledElementByViewportId('PT_AXIAL')
        .viewport.getViewReferenceId()
    )
  ).toContain('CT_VOLUME_ID');

  const locator = getVisibleViewportCanvas(page, 0);
  await simulateClicksOnElement({
    locator,
    points: [
      { x: 10, y: 10 },
      { x: 400, y: 400 },
    ],
  });

  // The statistics carry the Modality of the volume that the tool measured.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.cornerstoneTools.annotation.state.getAllAnnotations()[0]?.data
              ?.cachedStats?.statistics?.Modality
        ),
      { timeout: 30000 }
    )
    .toBe('PT');

  expect(pageErrors).toEqual([]);
});
