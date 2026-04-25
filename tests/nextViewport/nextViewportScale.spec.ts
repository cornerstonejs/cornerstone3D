import { expect, test, type Page } from '@playwright/test';
import {
  checkForScreenshot,
  expectViewportNextRuntime,
  screenShotPaths,
  setupRenderTracking,
  waitForRenderSettled,
  waitForViewportsRendered,
} from '../utils/index';

const EXAMPLE = 'nextViewportScale';
const RENDERING_ENGINE_ID = 'nextViewportScaleRenderingEngine';
const STACK_VIEWPORT_ID = 'CT_STACK_NEXT_SCALE';
const VOLUME_VIEWPORT_ID = 'CT_VOLUME_NEXT_SCALE';
const STACK_DATA_ID = 'next-viewport-scale:stack';
const VOLUME_DATA_ID = 'next-viewport-scale:volume';
const SCALE_ROW = '#next-viewport-scale-row';
const SCALE_X_SLIDER = '#next-viewport-scale-x';
const SCALE_Y_SLIDER = '#next-viewport-scale-y';
const SCALE_X_LABEL = '#next-viewport-scale-x-label';
const SCALE_Y_LABEL = '#next-viewport-scale-y-label';

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Next viewport scale screenshot baselines are authored for desktop chromium only.'
);

test.beforeEach(async ({ page }) => {
  await setupRenderTracking(page);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto(`http://localhost:3333/${EXAMPLE}.html`);
  await page.waitForLoadState('domcontentloaded');
  await page.locator(SCALE_ROW).waitFor({ state: 'visible' });
  await page.waitForSelector(`${SCALE_ROW} canvas:visible`, {
    state: 'visible',
  });
  await waitForViewportsRendered(page, 2);
});

test.describe('Next viewport two-axis scale', () => {
  test('uses native PlanarViewport stack and volume render paths', async ({
    page,
  }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: RENDERING_ENGINE_ID,
        viewportId: STACK_VIEWPORT_ID,
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          [STACK_DATA_ID]: 'vtkImage',
        },
      },
      {
        renderingEngineId: RENDERING_ENGINE_ID,
        viewportId: VOLUME_VIEWPORT_ID,
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          [VOLUME_DATA_ID]: 'vtkVolumeSlice',
        },
      },
    ]);
  });

  test('captures scale presets and fit modes', async ({ page }) => {
    const locator = page.locator(SCALE_ROW);
    const cases = [
      {
        button: 'Scale [1, 1]',
        sliderScale: [1, 1],
        viewportScale: [1, 1],
        scaleMode: 'fit',
        screenshotPath: screenShotPaths.nextViewportScale.scale1x1,
      },
      {
        button: 'Uniform 1.5',
        sliderScale: [1.5, 1.5],
        viewportScale: [1.5, 1.5],
        scaleMode: 'fit',
        screenshotPath: screenShotPaths.nextViewportScale.uniform1p5,
      },
      {
        button: 'Wide [2, 1]',
        sliderScale: [2, 1],
        viewportScale: [2, 1],
        scaleMode: 'fit',
        screenshotPath: screenShotPaths.nextViewportScale.wide2x1,
      },
      {
        button: 'Tall [1, 2]',
        sliderScale: [1, 2],
        viewportScale: [1, 2],
        scaleMode: 'fit',
        screenshotPath: screenShotPaths.nextViewportScale.tall1x2,
      },
      {
        button: 'Fit Aspect',
        sliderScale: [1, 1],
        viewportScale: [1, 1],
        scaleMode: 'fitAspect',
        screenshotPath: screenShotPaths.nextViewportScale.fitAspect,
      },
      {
        button: 'Fit Width',
        sliderScale: [1, 1],
        scaleMode: 'fitWidth',
        screenshotPath: screenShotPaths.nextViewportScale.fitWidth,
      },
      {
        button: 'Fit Height',
        sliderScale: [1, 1],
        scaleMode: 'fitHeight',
        screenshotPath: screenShotPaths.nextViewportScale.fitHeight,
      },
      {
        button: 'Absolute Fill',
        sliderScale: [1, 1],
        scaleMode: 'absolute',
        screenshotPath: screenShotPaths.nextViewportScale.absoluteFill,
      },
    ] as const;

    for (const screenshotCase of cases) {
      await test.step(screenshotCase.button, async () => {
        await clickToolbarButton(page, screenshotCase.button);
        await expectScaleState(
          page,
          screenshotCase.sliderScale[0],
          screenshotCase.sliderScale[1],
          screenshotCase.scaleMode,
          screenshotCase.viewportScale
        );
        await checkForScreenshot(page, locator, screenshotCase.screenshotPath);
      });
    }
  });

  test('keeps sliders synchronized after preset scale changes', async ({
    page,
  }) => {
    const locator = page.locator(SCALE_ROW);

    await clickToolbarButton(page, 'Wide [2, 1]');
    await expectScaleState(page, 2, 1, 'fit');

    await page.locator(SCALE_X_SLIDER).press('ArrowLeft');
    await expectScaleState(page, 1.95, 1, 'fit');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.nextViewportScale.wideSliderNudge
    );
  });
});

async function clickToolbarButton(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await waitForRenderSettled(page);
}

async function expectScaleState(
  page: Page,
  scaleX: number,
  scaleY: number,
  scaleMode: string,
  viewportScale?: readonly [number, number]
) {
  if (viewportScale) {
    const expectedScale = `scale: [${viewportScale[0].toFixed(
      2
    )}, ${viewportScale[1].toFixed(2)}]`;

    await expect(page.locator(SCALE_ROW)).toContainText(expectedScale);
  }

  await expect(page.locator(SCALE_ROW)).toContainText(`scaleMode: ${scaleMode}`);
  await expect(page.locator(SCALE_X_SLIDER)).toHaveValue(String(scaleX));
  await expect(page.locator(SCALE_Y_SLIDER)).toHaveValue(String(scaleY));
  await expect(page.locator(SCALE_X_LABEL)).toHaveText(
    `Scale X: ${scaleX.toFixed(2)}`
  );
  await expect(page.locator(SCALE_Y_LABEL)).toHaveText(
    `Scale Y: ${scaleY.toFixed(2)}`
  );
}
