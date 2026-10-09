import type { Page } from '@playwright/test';
import { test, expect } from 'playwright-test-coverage';
import {
  visitExample,
  checkForCanvasSnapshot,
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
    for (const screenshotCase of screenshotCases) {
      await test.step(screenshotCase.name, async () => {
        await selectDisplayAreaPreset(page, screenshotCase.name);
        await checkForCanvasSnapshot(
          page,
          '',
          screenshotCase.screenshotPath,
          0
        );
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

type StackPositionViewport = {
  sWidth: number;
  sHeight: number;
  setDisplayArea: (displayArea: unknown) => void;
  render: () => void;
  getCamera: () => { focalPoint: number[] };
  getImageData: () => {
    imageData: {
      getDimensions: () => number[];
      indexToWorld: (index: number[]) => number[];
    };
  };
  worldToCanvas: (world: number[]) => number[];
};

type StackPositionWindow = {
  cornerstone: {
    getRenderingEngine: (id: string) => {
      resize: (immediate: boolean, keepCamera: boolean) => void;
      getViewport: (id: string) => StackPositionViewport;
    };
  };
};

test.describe('Stack Position stored display area', () => {
  // A display area stored as the initial camera used to become the baseline
  // the next setDisplayArea measured its zoom and pan against, so applying
  // the same area again moved the image point off the canvas point.
  test('keeps the image point on the canvas point when applied repeatedly', async ({
    page,
  }) => {
    for (let i = 0; i < 3; i++) {
      const { imagePointOnCanvas, canvasCentre } = await page.evaluate(
        async () => {
          const viewport = (
            window as unknown as StackPositionWindow
          ).cornerstone
            .getRenderingEngine('myRenderingEngine')
            .getViewport('CT_STACK');
          viewport.setDisplayArea({
            imageArea: [2, 2],
            imageCanvasPoint: {
              imagePoint: [0.5, 0.35],
              canvasPoint: [0.5, 0.5],
            },
            storeAsInitialCamera: true,
          });
          viewport.render();

          const { imageData } = viewport.getImageData();
          const [columns, rows] = imageData.getDimensions();
          const devicePixelRatio = window.devicePixelRatio || 1;
          return {
            imagePointOnCanvas: viewport.worldToCanvas(
              imageData.indexToWorld([columns * 0.5, rows * 0.35, 0])
            ),
            canvasCentre: [
              viewport.sWidth / devicePixelRatio / 2,
              viewport.sHeight / devicePixelRatio / 2,
            ],
          };
        }
      );

      expect(imagePointOnCanvas[0]).toBeCloseTo(canvasCentre[0], 0);
      expect(imagePointOnCanvas[1]).toBeCloseTo(canvasCentre[1], 0);
    }
  });

  // The context pool engine resizes the on-screen canvas only when it renders
  // the next frame, but resets the camera (and so applies the display area)
  // as soon as the viewport is resized. Conversions made in between must use
  // the new size, not the canvas that still holds the old one.
  test('converts coordinates at the new size before the next render', async ({
    page,
  }) => {
    const { focalPointOnCanvas, canvasCentre } = await page.evaluate(
      async () => {
        const renderingEngine = (
          window as unknown as StackPositionWindow
        ).cornerstone.getRenderingEngine('myRenderingEngine');
        const viewport = renderingEngine.getViewport('CT_STACK');

        // Let any scheduled frame run, or resize() defers to it.
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );

        const element = document.querySelector(
          '#cornerstone-element'
        ) as HTMLElement;
        element.style.width = '600px';
        element.style.height = '700px';
        renderingEngine.resize(false, true);

        const devicePixelRatio = window.devicePixelRatio || 1;
        return {
          focalPointOnCanvas: viewport.worldToCanvas(
            viewport.getCamera().focalPoint
          ),
          canvasCentre: [
            viewport.sWidth / devicePixelRatio / 2,
            viewport.sHeight / devicePixelRatio / 2,
          ],
        };
      }
    );

    expect(focalPointOnCanvas[0]).toBeCloseTo(canvasCentre[0], 0);
    expect(focalPointOnCanvas[1]).toBeCloseTo(canvasCentre[1], 0);
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

  await page.waitForTimeout(100);
}
