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
  await page.goto('/');
  if (waitForNetwork) {
    await page.waitForLoadState('networkidle');
  }
  if (waitForDom) {
    await page.waitForLoadState('domcontentloaded');
  }
  /**
   * Wait for the examples container to be ready (for styled index page)
   */
  await page.waitForSelector('#examples-container, #content', { timeout: 5000 }).catch(() => {
    /** Fallback if selector doesn't exist - continue anyway */
  });
  /**
   * Use href selector instead of text selector to work with both old and new index pages
   * The new styled index shows example names, not IDs, so matching by href is more reliable
   */
  const linkSelector = `a[href="${title}.html"]`;
  await page.waitForSelector(linkSelector, { timeout: 10000 });
  await page.click(linkSelector);
  await page.waitForSelector('div#content');
  if (waitForNetwork) {
    await page.waitForLoadState('networkidle');
  }
  if (waitForDom) {
    await page.waitForLoadState('domcontentloaded');
  }
  await page.waitForTimeout(delay);
};
