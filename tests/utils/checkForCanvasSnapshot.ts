import { expect } from '@playwright/test';
import type { Page } from 'playwright';

/**
 * Compares the raw pixel buffer of a <canvas> element against a baseline PNG.
 *
 * Unlike `checkForScreenshot`, this does not crop the rendered page. The PNG
 * is produced from `canvas.toDataURL('image/png')`, so the comparison is
 * decoupled from CSS layout and from any DOM that happens to overlap the
 * canvas region. Pass `viewportIndex` for pages with multiple viewports — it
 * resolves the Nth element with a `[data-viewport-uid]` attribute and grabs
 * the canvas inside it (same shape as `getVisibleViewportCanvas`).
 *
 * For annotation/tool tests, set `includeSvgOverlay: true` to rasterize the
 * sibling SVG annotation layer onto the captured canvas before comparison.
 */
const checkForCanvasSnapshot = async (
  page: Page,
  canvasSelector: string,
  screenshotPath: string,
  viewportIndex?: number,
  options: { includeSvgOverlay?: boolean } = {}
) => {
  const locator =
    typeof viewportIndex === 'number'
      ? page
          .locator('[data-viewport-uid]')
          .nth(viewportIndex)
          .locator('canvas:visible')
          .first()
      : page.locator(canvasSelector).first();
  await locator.waitFor({ state: 'visible', timeout: 30000 });

  const base64 = await page.evaluate(
    async ({ selector, idx, includeSvgOverlay }) => {
      let canvas: HTMLCanvasElement | null = null;
      let viewportEl: HTMLElement | null = null;
      if (typeof idx === 'number') {
        const vps = document.querySelectorAll('[data-viewport-uid]');
        viewportEl = (vps[idx] as HTMLElement) ?? null;
        canvas =
          (viewportEl?.querySelector('canvas:not([style*="display: none"])') as
            | HTMLCanvasElement
            | null) ??
          (viewportEl?.querySelector('canvas') as HTMLCanvasElement | null);
      } else {
        canvas = document.querySelector(selector) as HTMLCanvasElement | null;
        viewportEl = canvas?.closest(
          '[data-viewport-uid]'
        ) as HTMLElement | null;
      }
      if (!canvas) {
        throw new Error(
          `checkForCanvasSnapshot: canvas not found (selector=${selector}, viewportIndex=${idx})`
        );
      }

      if (!includeSvgOverlay) {
        const dataUrl = canvas.toDataURL('image/png');
        const comma = dataUrl.indexOf(',');
        return comma === -1 ? '' : dataUrl.slice(comma + 1);
      }

      const svg = viewportEl?.querySelector('svg') as SVGSVGElement | null;
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext('2d');
      if (!ctx) {
        throw new Error('checkForCanvasSnapshot: failed to get 2d context');
      }
      ctx.drawImage(canvas, 0, 0);

      if (svg) {
        const xml = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        try {
          const img = new Image();
          img.decoding = 'sync';
          img.src = url;
          await img.decode();
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      const dataUrl = out.toDataURL('image/png');
      const comma = dataUrl.indexOf(',');
      return comma === -1 ? '' : dataUrl.slice(comma + 1);
    },
    {
      selector: canvasSelector,
      idx: viewportIndex,
      includeSvgOverlay: options.includeSvgOverlay ?? false,
    }
  );

  const buffer = Buffer.from(base64, 'base64');

  await expect(buffer).toMatchSnapshot(screenshotPath, {
    maxDiffPixelRatio: 0,
    threshold: 0.02,
  });
};

export { checkForCanvasSnapshot };
