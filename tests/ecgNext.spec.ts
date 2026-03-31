import { test } from '@playwright/test';
import { checkForScreenshot, screenShotPaths } from './utils/index';

const EXAMPLE = 'ecg';
const SETTLE_MS = 5000;

function navigateToExample(params?: Record<string, string>) {
  return async ({ page }) => {
    const url = new URL(`http://localhost:3333/${EXAMPLE}.html`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    await page.goto(url.toString());
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#cornerstone-element', {
      state: 'visible',
    });
    await page.waitForTimeout(SETTLE_MS);
  };
}

test.describe('ECG Viewport - Legacy', () => {
  test.beforeEach(navigateToExample());

  test('should render ECG waveform (legacy)', async ({ page }) => {
    const locator = page.locator('#cornerstone-element');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.ecgNext.legacyViewport
    );
  });
});

test.describe('ECG Viewport - Next', () => {
  test.beforeEach(navigateToExample({ type: 'next' }));

  test('should render ECG waveform (next)', async ({ page }) => {
    const locator = page.locator('#cornerstone-element');
    await checkForScreenshot(
      page,
      locator,
      screenShotPaths.ecgNext.nextViewport
    );
  });
});
