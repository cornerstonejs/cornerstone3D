import { test, expect } from '@playwright/test';
import {
  checkForScreenshot,
  getVisibleViewportCanvas,
  getSegmentationActorClassNames,
  screenShotPaths,
} from './utils/index';

const EXAMPLE = 'labelmapSliceRendering';
const SETTLE_MS = 5000;
const SEGMENTATION_ID = 'MY_SEGMENTATION_ID';

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

test.describe('Labelmap Slice Rendering - Legacy', () => {
  test.beforeEach(navigateToExample());

  test('should render labelmap with useSliceRendering in all orientations (legacy)', async ({
    page,
  }) => {
    const axial = getVisibleViewportCanvas(page, 0);
    const coronal = getVisibleViewportCanvas(page, 1);
    const sagittal = getVisibleViewportCanvas(page, 2);

    await checkForScreenshot(
      page,
      axial,
      screenShotPaths.labelmapSliceRenderingNext.legacyAxial
    );
    await checkForScreenshot(
      page,
      coronal,
      screenShotPaths.labelmapSliceRenderingNext.legacyCoronal
    );
    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.labelmapSliceRenderingNext.legacySagittal
    );
  });

  test('should use vtkImageSlice actor for segmentation (legacy)', async ({
    page,
  }) => {
    const classNames = await getSegmentationActorClassNames(
      page,
      SEGMENTATION_ID
    );

    expect(classNames.length).toBeGreaterThan(0);
    for (const className of classNames) {
      expect(className).toBe('vtkImageSlice');
    }
  });
});

test.describe('Labelmap Slice Rendering - Next (GPU)', () => {
  test.beforeEach(navigateToExample({ type: 'next' }));

  test('should render labelmap with useSliceRendering in all orientations (next GPU)', async ({
    page,
  }) => {
    const axial = getVisibleViewportCanvas(page, 0);
    const coronal = getVisibleViewportCanvas(page, 1);
    const sagittal = getVisibleViewportCanvas(page, 2);

    await checkForScreenshot(
      page,
      axial,
      screenShotPaths.labelmapSliceRenderingNext.nextAxial
    );
    await checkForScreenshot(
      page,
      coronal,
      screenShotPaths.labelmapSliceRenderingNext.nextCoronal
    );
    await checkForScreenshot(
      page,
      sagittal,
      screenShotPaths.labelmapSliceRenderingNext.nextSagittal
    );
  });

  test('should use vtkImageSlice actor for segmentation (next GPU)', async ({
    page,
  }) => {
    const classNames = await getSegmentationActorClassNames(
      page,
      SEGMENTATION_ID
    );

    expect(classNames.length).toBeGreaterThan(0);
    for (const className of classNames) {
      expect(className).toBe('vtkImageSlice');
    }
  });
});
