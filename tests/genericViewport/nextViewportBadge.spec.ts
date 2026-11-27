import { expect, test, type Page } from '@playwright/test';
import { createExampleUrl } from '../utils/index';

const EXAMPLE = 'stackBasic';
const BADGE_SELECTOR = '#cs3d-next-viewport-badge';

/**
 * Opens the example and waits for the canvas of its viewport. The example
 * enables the viewport after initDemo returns, so the badge is in its final
 * state when the canvas is visible.
 */
async function navigateToExample(
  page: Page,
  params: Record<string, string> = {}
) {
  const url = createExampleUrl(EXAMPLE + '.html');

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  await page.goto(url.toString());
  await page.waitForSelector('#content canvas:visible', {
    state: 'visible',
    timeout: 30000,
  });
}

test.describe('Next viewport badge', () => {
  test('should show the badge when the example runs on the next viewports', async ({
    page,
  }) => {
    await navigateToExample(page, { type: 'next' });

    const badge = page.locator(BADGE_SELECTOR);

    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('Next viewports');

    const useGenericViewport = await page.evaluate(() =>
      window.cornerstone?.getUseGenericViewport?.()
    );

    expect(useGenericViewport).toBe(true);
  });

  test('should not take pointer events', async ({ page }) => {
    await navigateToExample(page, { type: 'next' });

    const isHitByPointer = await page
      .locator(BADGE_SELECTOR)
      .evaluate((badge) => {
        const { x, y, width, height } = badge.getBoundingClientRect();

        return (
          document.elementFromPoint(x + width / 2, y + height / 2) === badge
        );
      });

    expect(isHitByPointer).toBe(false);
  });

  test('should not show the badge without the override', async ({ page }) => {
    await navigateToExample(page);

    await expect(page.locator(BADGE_SELECTOR)).toHaveCount(0);

    const useGenericViewport = await page.evaluate(() =>
      window.cornerstone?.getUseGenericViewport?.()
    );

    expect(useGenericViewport).toBe(false);
  });
});
