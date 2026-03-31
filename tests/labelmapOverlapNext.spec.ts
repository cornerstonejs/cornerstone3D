import { test } from '@playwright/test';
import {
  checkForScreenshot,
  getVisibleViewportCanvas,
  screenShotPaths,
  simulateDrawPath,
} from './utils/index';

const EXAMPLE = 'labelmapOverlapPlayground';
const SETTLE_MS = 10000;
const TOOL_GROUP_ID = 'LABELMAP_OVERLAP_PLAYGROUND_TOOLGROUP';

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

async function paintOverlapOnStack(page) {
  const canvas = getVisibleViewportCanvas(page, 0);

  await simulateDrawPath(
    page,
    canvas,
    [
      [175, 160],
      [240, 165],
      [250, 245],
      [180, 255],
    ],
    {
      interpolateSteps: true,
    }
  );

  await page.waitForTimeout(1200);

  await page.getByRole('combobox').nth(1).selectOption('2');
  await page.getByRole('button', { name: 'Allow Overlap' }).click();

  await simulateDrawPath(
    page,
    canvas,
    [
      [205, 175],
      [285, 185],
      [280, 265],
      [205, 250],
    ],
    {
      interpolateSteps: true,
    }
  );

  await page.waitForTimeout(1500);
}

async function disableActivePrimaryTool(page) {
  await page.evaluate((toolGroupId) => {
    const toolGroup = (window as typeof window & {
      cornerstoneTools?: {
        ToolGroupManager?: {
          getToolGroup?: (id: string) => {
            getActivePrimaryMouseButtonTool?: () => string | undefined;
            setToolDisabled?: (toolName: string) => void;
          } | null;
        };
      };
    }).cornerstoneTools?.ToolGroupManager?.getToolGroup?.(toolGroupId);

    const activeToolName = toolGroup?.getActivePrimaryMouseButtonTool?.();

    if (activeToolName) {
      toolGroup?.setToolDisabled?.(activeToolName);
    }
  }, TOOL_GROUP_ID);

  await page.waitForTimeout(300);
}

test.describe('Labelmap Overlap Playground - Legacy', () => {
  test.beforeEach(navigateToExample({ labelmapImageMapper: '1' }));

  test('should render overlapping labelmaps on stack and orthographic views (legacy)', async ({
    page,
  }) => {
    await paintOverlapOnStack(page);
    await disableActivePrimaryTool(page);

    const locator = page.locator('#content > div');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.labelmapOverlapNext.legacyViewport
    );
  });
});
