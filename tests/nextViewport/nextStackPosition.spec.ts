import { expect, test, type Page } from '@playwright/test';
import {
  createExampleUrl,
  checkForScreenshot,
  expectViewportNextRuntime,
  screenShotPaths,
} from '../utils/index';

const EXAMPLE = 'nextStackPosition';
const RENDERING_ENGINE_ID = 'myRenderingEngine';
const VIEWPORT_ID = 'CT_STACK_NEXT_POSITION';
const STACK_DATA_ID = 'stack-position-next:primary';
const STACK_POSITION_ELEMENT = '#cornerstone-element';
const DISPLAY_AREA_DROPDOWN = '#demo-toolbar select';

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Next stack position screenshot baselines are authored for desktop chromium only.'
);

const screenshotCases = [
  {
    name: 'Center Full',
    screenshotPath: screenShotPaths.nextStackPosition.centerFull,
  },
  {
    name: 'Center with border',
    screenshotPath: screenShotPaths.nextStackPosition.centerWithBorder,
  },
  {
    name: 'Center Half',
    screenshotPath: screenShotPaths.nextStackPosition.centerHalf,
  },
  {
    name: 'Left Top',
    screenshotPath: screenShotPaths.nextStackPosition.leftTop,
  },
  {
    name: 'Right Top',
    screenshotPath: screenShotPaths.nextStackPosition.rightTop,
  },
  {
    name: 'Center Left/Top',
    screenshotPath: screenShotPaths.nextStackPosition.centerLeftTop,
  },
  {
    name: 'Center Right/Bottom',
    screenshotPath: screenShotPaths.nextStackPosition.centerRightBottom,
  },
  {
    name: 'Left Bottom',
    screenshotPath: screenShotPaths.nextStackPosition.leftBottom,
  },
  {
    name: 'Right Bottom',
    screenshotPath: screenShotPaths.nextStackPosition.rightBottom,
  },
  {
    name: 'Left Top Half 2, 0.1',
    screenshotPath: screenShotPaths.nextStackPosition.leftTopHalfWideShort,
  },
  {
    name: 'Left Top Half 0.1, 2',
    screenshotPath: screenShotPaths.nextStackPosition.leftTopHalfNarrowTall,
  },
  {
    name: 'Left Top Half 2,2',
    screenshotPath: screenShotPaths.nextStackPosition.leftTopHalf,
  },
  {
    name: 'Right Top Half',
    screenshotPath: screenShotPaths.nextStackPosition.rightTopHalf,
  },
  {
    name: 'Left Bottom Half',
    screenshotPath: screenShotPaths.nextStackPosition.leftBottomHalf,
  },
  {
    name: 'Right Bottom Half',
    screenshotPath: screenShotPaths.nextStackPosition.rightBottomHalf,
  },
  {
    name: '90 Left Top Half',
    screenshotPath: screenShotPaths.nextStackPosition.rotate90LeftTopHalf,
  },
  {
    name: '180 Right Top Half',
    screenshotPath: screenShotPaths.nextStackPosition.rotate180RightTopHalf,
  },
  {
    name: 'Flip Left Bottom Half',
    screenshotPath: screenShotPaths.nextStackPosition.flipLeftBottomHalf,
  },
  {
    name: 'Flip 180 Right Bottom Half',
    screenshotPath:
      screenShotPaths.nextStackPosition.flipRotate180RightBottomHalf,
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto(createExampleUrl(EXAMPLE + '.html').toString());
  await page.waitForLoadState('domcontentloaded');
  await page.locator(STACK_POSITION_ELEMENT).waitFor({ state: 'visible' });
  await page.locator(DISPLAY_AREA_DROPDOWN).first().waitFor({
    state: 'visible',
  });
  await page.waitForSelector(`${STACK_POSITION_ELEMENT} canvas:visible`, {
    state: 'visible',
  });
  await page.waitForFunction(
    ({ renderingEngineId, viewportId }) => {
      const cornerstone = (
        window as unknown as {
          cornerstone?: {
            getRenderingEngine?: (id: string) => {
              getViewport?: (id: string) => {
                getCurrentImageId?: () => string | undefined;
              };
            };
          };
        }
      ).cornerstone;
      const renderingEngine =
        cornerstone?.getRenderingEngine?.(renderingEngineId);
      const viewport = renderingEngine?.getViewport?.(viewportId);

      return Boolean(viewport?.getCurrentImageId?.());
    },
    { renderingEngineId: RENDERING_ENGINE_ID, viewportId: VIEWPORT_ID }
  );
});

test.describe('Stack Position Next display area', () => {
  test('uses the native PlanarViewport API', async ({ page }) => {
    await expectViewportNextRuntime(page, [
      {
        renderingEngineId: RENDERING_ENGINE_ID,
        viewportId: VIEWPORT_ID,
        constructorName: 'PlanarViewport',
        type: 'planarNext',
        renderModesByDataId: {
          [STACK_DATA_ID]: 'vtkImage',
        },
      },
    ]);
  });

  test('captures native ViewportNext display area presets', async ({
    page,
  }) => {
    const locator = page.locator(STACK_POSITION_ELEMENT);

    for (const screenshotCase of screenshotCases) {
      await test.step(screenshotCase.name, async () => {
        await selectDisplayAreaPreset(page, screenshotCase.name);
        await checkForScreenshot(page, locator, screenshotCase.screenshotPath);
      });
    }
  });

  test('applies rotation presets through the native view presentation', async ({
    page,
  }) => {
    await selectDisplayAreaPreset(page, '90 Left Top Half');
    await expect(page.locator('#content')).toContainText('Rotation: 90');

    await selectDisplayAreaPreset(page, '180 Right Top Half');
    await expect(page.locator('#content')).toContainText('Rotation: 180');
  });
});

async function selectDisplayAreaPreset(page: Page, presetName: string) {
  await page.evaluate(
    ({ selector, presetName }) => {
      const select = document.querySelector(
        selector
      ) as HTMLSelectElement | null;

      if (!select) {
        throw new Error(`Display area dropdown not found: ${selector}`);
      }

      select.value = presetName;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { selector: DISPLAY_AREA_DROPDOWN, presetName }
  );

  await expect(page.locator('#content')).toContainText(`DisplayArea: {`);
  await page.waitForTimeout(100);
}
