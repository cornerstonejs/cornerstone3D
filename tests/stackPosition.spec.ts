import type { Page } from '@playwright/test';
import { test, expect } from 'playwright-test-coverage';
import {
  visitExample,
  checkForScreenshot,
  screenShotPaths,
} from './utils/index';

const STACK_POSITION_ELEMENT = '#cornerstone-element';
const DISPLAY_AREA_DROPDOWN = '#demo-toolbar select';

test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Stack position screenshot baselines are authored for desktop chromium only.'
);

const screenshotCases = [
  {
    name: 'Center Full',
    screenshotPath: screenShotPaths.stackPosition.centerFull,
  },
  {
    name: 'Center with border',
    screenshotPath: screenShotPaths.stackPosition.centerWithBorder,
  },
  {
    name: 'Center Half',
    screenshotPath: screenShotPaths.stackPosition.centerHalf,
  },
  {
    name: 'Left Top',
    screenshotPath: screenShotPaths.stackPosition.leftTop,
  },
  {
    name: 'Right Top',
    screenshotPath: screenShotPaths.stackPosition.rightTop,
  },
  {
    name: 'Center Left/Top',
    screenshotPath: screenShotPaths.stackPosition.centerLeftTop,
  },
  {
    name: 'Center Right/Bottom',
    screenshotPath: screenShotPaths.stackPosition.centerRightBottom,
  },
  {
    name: 'Left Bottom',
    screenshotPath: screenShotPaths.stackPosition.leftBottom,
  },
  {
    name: 'Right Bottom',
    screenshotPath: screenShotPaths.stackPosition.rightBottom,
  },
  {
    name: 'Left Top Half 2, 0.1',
    screenshotPath: screenShotPaths.stackPosition.leftTopHalfWideShort,
  },
  {
    name: 'Left Top Half 0.1, 2',
    screenshotPath: screenShotPaths.stackPosition.leftTopHalfNarrowTall,
  },
  {
    name: 'Left Top Half 2,2',
    screenshotPath: screenShotPaths.stackPosition.leftTopHalf,
  },
  {
    name: 'Right Top Half',
    screenshotPath: screenShotPaths.stackPosition.rightTopHalf,
  },
  {
    name: 'Left Bottom Half',
    screenshotPath: screenShotPaths.stackPosition.leftBottomHalf,
  },
  {
    name: 'Right Bottom Half',
    screenshotPath: screenShotPaths.stackPosition.rightBottomHalf,
  },
  {
    name: 'Flip Left Bottom Half',
    screenshotPath: screenShotPaths.stackPosition.flipLeftBottomHalf,
  },
];

test.beforeEach(async ({ page }) => {
  await visitExample(page, 'stackPosition');
  await page.locator(STACK_POSITION_ELEMENT).waitFor({ state: 'visible' });
  await page.locator(DISPLAY_AREA_DROPDOWN).first().waitFor({
    state: 'visible',
  });
  await page.waitForFunction(() => {
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
      cornerstone?.getRenderingEngine?.('myRenderingEngine');
    const viewport = renderingEngine?.getViewport?.('CT_STACK');

    return Boolean(viewport?.getCurrentImageId?.());
  });
});

test.describe('Stack Position display area', () => {
  test('captures known-correct display area presets', async ({ page }) => {
    const locator = page.locator(STACK_POSITION_ELEMENT);

    for (const screenshotCase of screenshotCases) {
      await test.step(screenshotCase.name, async () => {
        await selectDisplayAreaPreset(page, screenshotCase.name);
        await checkForScreenshot(page, locator, screenshotCase.screenshotPath);
      });
    }
  });

  test.fail(
    'applies the 90 degree rotation display area preset',
    async ({ page }) => {
      await selectDisplayAreaPreset(page, '90 Left Top Half');
      await expect(page.locator('#content')).toContainText('Rotation: 90');
    }
  );

  test.fail(
    'applies the 180 degree rotation display area preset',
    async ({ page }) => {
      await selectDisplayAreaPreset(page, '180 Right Top Half');
      await expect(page.locator('#content')).toContainText('Rotation: 180');
    }
  );
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

  await page.waitForTimeout(100);
}
