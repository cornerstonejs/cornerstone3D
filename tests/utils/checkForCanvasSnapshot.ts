import { expect } from '@playwright/test';
import type { Page } from 'playwright';

/**
 * Compares the raw pixel buffer of a <canvas> element against a baseline PNG.
 *
 * Unlike `checkForScreenshot`, this does not crop the rendered page. The PNG is
 * produced from `canvas.toDataURL('image/png')`, so the comparison is decoupled
 * from CSS layout and from any DOM that happens to overlap the canvas region.
 *
 * The baseline is shared across rendering modes (legacy GPU, CPU fallback,
 * viewport-next compat) — the ground truth is the DICOM itself, not the mode,
 * so a single dcm2jpg-derived PNG is used for all of them.
 */
const checkForCanvasSnapshot = async (
  page: Page,
  canvasSelector: string,
  screenshotPath: string
) => {
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

  await expect(buffer).toMatchSnapshot(screenshotPath, {
    maxDiffPixelRatio: 0,
    threshold: 0.02,
  });
};

export { checkForCanvasSnapshot };
