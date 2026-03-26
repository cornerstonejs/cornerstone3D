import { test } from 'playwright-test-coverage';
import { checkForScreenshot, screenShotPaths } from './utils/index';

const EXAMPLE = 'video';
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

test.describe('Video Viewport - Legacy', () => {
  test.beforeEach(navigateToExample());

  test('should render video data (legacy)', async ({ page }) => {
    const locator = page.locator('#cornerstone-element');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.videoNext.legacyViewport
    );
  });
});

test.describe('Video Viewport - Next', () => {
  test.beforeEach(navigateToExample({ type: 'next' }));

  test('should render video data (next)', async ({ page }) => {
    const locator = page.locator('#cornerstone-element');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.videoNext.nextViewport
    );
  });
});
