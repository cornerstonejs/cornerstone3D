import { test } from 'playwright-test-coverage';
import {
  checkForScreenshot,
  getVisibleViewportCanvas,
  screenShotPaths,
  simulateClicksOnElement,
} from './utils/index';

const EXAMPLE = 'labelmapSegmentationTools';
const SETTLE_MS = 10000;

function navigateToExample(params?: Record<string, string>) {
  return async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const link = page.locator(`a:has-text("${EXAMPLE}")`).first();
    const href = await link.getAttribute('href');
    const url = new URL(href, page.url());
    url.pathname = url.pathname.replace(/\.html$/, '');

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    await page.goto(url.toString());
    await page.waitForSelector('div#content');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);
  };
}

async function selectSphereBrushAndPaint(page) {
  await page
    .getByRole('combobox')
    .first()
    .selectOption({ label: 'SphereBrush' });

  const firstCanvas = getVisibleViewportCanvas(page, 0);

  await simulateClicksOnElement({
    locator: firstCanvas,
    points: [
      { x: 193, y: 273 },
      { x: 226, y: 274 },
      { x: 195, y: 302 },
      { x: 218, y: 301 },
    ],
  });

  await page.waitForTimeout(1500);
}

async function disableActivePrimaryTool(page) {
  await page.evaluate(() => {
    const toolGroup = (window as typeof window & {
      cornerstoneTools?: {
        ToolGroupManager?: {
          getToolGroup?: (toolGroupId: string) => {
            getActivePrimaryMouseButtonTool?: () => string | undefined;
            setToolDisabled?: (toolName: string) => void;
          } | null;
        };
      };
    }).cornerstoneTools?.ToolGroupManager?.getToolGroup?.('MY_TOOLGROUP_ID');

    const activeToolName = toolGroup?.getActivePrimaryMouseButtonTool?.();

    if (activeToolName) {
      toolGroup?.setToolDisabled?.(activeToolName);
    }
  });

  await page.waitForTimeout(300);
}

test.describe('Labelmap Segmentation Tools - Legacy', () => {
  test.beforeEach(navigateToExample());

  test('should paint with sphere brush (legacy)', async ({ page }) => {
    await selectSphereBrushAndPaint(page);
    await disableActivePrimaryTool(page);
    const locator = page.locator('#content > div');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.labelmapSegToolsNext.legacySphereBrush
    );
  });
});

test.describe('Labelmap Segmentation Tools - Next (GPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next' }));

  test('should paint with sphere brush (next GPU)', async ({ page }) => {
    await selectSphereBrushAndPaint(page);
    await disableActivePrimaryTool(page);
    const locator = page.locator('#content > div');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.labelmapSegToolsNext.nextSphereBrush
    );
  });
});

test.describe('Labelmap Segmentation Tools - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next', cpu: 'true' }));

  test('should paint with sphere brush (next CPU)', async ({ page }) => {
    await selectSphereBrushAndPaint(page);
    await disableActivePrimaryTool(page);
    const locator = page.locator('#content > div');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.labelmapSegToolsNext.nextCpuSphereBrush
    );
  });
});
