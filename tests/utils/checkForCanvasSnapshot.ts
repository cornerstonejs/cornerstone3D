import { expect } from '@playwright/test';
import type { Page } from 'playwright';
import { resolveCompatibilityScreenshotPath } from './compatibilityMode';

/**
 * Compares the raw pixel buffer of a <canvas> element against a baseline PNG.
 *
 * Unlike `checkForScreenshot`, this does not crop the rendered page. The PNG is
 * produced from `canvas.toDataURL('image/png')`, so the comparison is decoupled
 * from CSS layout and from any DOM that happens to overlap the canvas region.
 */
const checkForCanvasSnapshot = async (
  page: Page,
  canvasSelector: string,
  screenshotPath: string
) => {
  const resolvedScreenshotPath =
    resolveCompatibilityScreenshotPath(screenshotPath);

  const base64 = await page.evaluate((selector) => {
    const canvas = document.querySelector(
      selector
    ) as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error(`checkForCanvasSnapshot: canvas not found: ${selector}`);
    }
    const dataUrl = canvas.toDataURL('image/png');
    const comma = dataUrl.indexOf(',');
    return comma === -1 ? '' : dataUrl.slice(comma + 1);
  }, canvasSelector);

  const buffer = Buffer.from(base64, 'base64');

  await expect(buffer).toMatchSnapshot(resolvedScreenshotPath, {
    maxDiffPixelRatio: 0,
  });
};

export { checkForCanvasSnapshot };
