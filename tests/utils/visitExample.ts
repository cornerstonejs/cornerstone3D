import type { Page } from '@playwright/test';

/**
 * Visit the example page
 * @param page - The page to visit
 * @param title - The title of the example page
 */
export const visitExample = async (
  page: Page,
  title: string,
  delay = 0,
  waitForNetwork = true,
  waitForDom = true
) => {
  // Size to a constant size to prevent scroll into view changes
  // which can trigger renderingEngine.resize() and move the image on capture.
  const currentViewport = page.viewportSize();
  const isLikelyDesktop =
    !currentViewport || currentViewport.width >= 800;

  if (isLikelyDesktop) {
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await page.goto('/');
  if (waitForNetwork) {
    await page.waitForLoadState('networkidle');
  }
  if (waitForDom) {
    await page.waitForLoadState('domcontentloaded');
  }
  await page.click(`a:has-text("${title}")`);
  await page.waitForSelector('div#content');
  if (waitForNetwork) {
    await page.waitForLoadState('networkidle');
  }
  if (waitForDom) {
    await page.waitForLoadState('domcontentloaded');
  }
  await page.waitForTimeout(delay);
};
