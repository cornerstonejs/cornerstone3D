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
  // Fixed viewport so layout is deterministic; avoids scroll/layout differences
  // that can trigger renderingEngine.resize() and move the image on capture.
  await page.setViewportSize({ width: 1280, height: 900 });

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
