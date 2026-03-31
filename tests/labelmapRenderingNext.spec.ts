import { test } from '@playwright/test';
import {
  checkForScreenshot,
  getVisibleViewportCanvas,
  screenShotPaths,
} from './utils/index';

const EXAMPLE = 'labelmapRendering';
const SETTLE_MS = 5000;

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

test.describe('Labelmap Rendering - Legacy', () => {
  test.beforeEach(navigateToExample());

  test('should render labelmap in all orientations (legacy)', async ({
    page,
  }) => {
    const axial = getVisibleViewportCanvas(page, 0);
    const coronal = getVisibleViewportCanvas(page, 1);
    const sagittal = getVisibleViewportCanvas(page, 2);

    await checkForScreenshot(
      page,
      axial,
      screenShotPaths.labelmapRenderingNext.legacyAxial
    );
    await checkForScreenshot(
      page,
      coronal,
      screenShotPaths.labelmapRenderingNext.legacyCoronal
    );
    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.labelmapRenderingNext.legacySagittal
    );
  });
});

test.describe('Labelmap Rendering - Next (GPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next' }));

  test('should render labelmap in all orientations (next GPU)', async ({
    page,
  }) => {
    const axial = getVisibleViewportCanvas(page, 0);
    const coronal = getVisibleViewportCanvas(page, 1);
    const sagittal = getVisibleViewportCanvas(page, 2);

    await checkForScreenshot(
      page,
      axial,
      screenShotPaths.labelmapRenderingNext.nextAxial
    );
    await checkForScreenshot(
      page,
      coronal,
      screenShotPaths.labelmapRenderingNext.nextCoronal
    );
    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.labelmapRenderingNext.nextSagittal
    );
  });
});

test.describe('Labelmap Rendering - Next (CPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next', cpu: 'true' }));

  test('should render labelmap in all orientations (next CPU)', async ({
    page,
  }) => {
    const axial = getVisibleViewportCanvas(page, 0);
    const coronal = getVisibleViewportCanvas(page, 1);
    const sagittal = getVisibleViewportCanvas(page, 2);

    await checkForScreenshot(
      page,
      axial,
      screenShotPaths.labelmapRenderingNext.nextCpuAxial
    );
    await checkForScreenshot(
      page,
      coronal,
      screenShotPaths.labelmapRenderingNext.nextCpuCoronal
    );
    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.labelmapRenderingNext.nextCpuSagittal
    );
  });
});
