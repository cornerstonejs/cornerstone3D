import { expect } from '@playwright/test';
import type { Page } from 'playwright';

interface CheckForCanvasSnapshotOptions {
  /**
   * Wait until the captured PNG buffer is identical for this many
   * consecutive milliseconds before snapshotting. Set to 0 for always-
   * animating viewports (video, CINE) where stability never converges.
   */
  stableMs?: number;
  /** Cap on stability waiting; falls back to last capture after this. */
  timeoutMs?: number;
}

/**
 * Compares the raw pixel buffer of one or more <canvas> elements against a
 * baseline PNG.
 *
 * Output dimensions always match the canvas backing-store size (or, for the
 * multi-viewport composite, the union of those sizes). The sibling SVG
 * annotation layer is rasterized on top so tool overlays are included.
 * Non-canvas/non-SVG HTML overlays (e.g. CSS-positioned border divs the
 * stackPosition example uses) are NOT captured by design — capturing them
 * required either an SVG `foreignObject` (taints the canvas in Chromium) or
 * a Playwright element screenshot (couples output size to CSS layout).
 *
 * Pass `viewportIndex` as a single number to capture the Nth
 * `[data-viewport-uid]` element, or as an array to composite multiple
 * viewports into a single PNG using their real DOM offsets.
 *
 * Captures are pixel-stability-polled: the snapshot is only encoded once the
 * canvas (+SVG) data URL has been identical for `stableMs` consecutive ms, so
 * tests don't race ahead of cornerstone's render completion.
 */
const checkForCanvasSnapshot = async (
  page: Page,
  canvasSelector: string,
  screenshotPath: string,
  viewportIndex?: number | number[],
  options: CheckForCanvasSnapshotOptions = {}
) => {
  const { stableMs = 300, timeoutMs = 5000 } = options;
  const indices =
    typeof viewportIndex === 'number'
      ? [viewportIndex]
      : Array.isArray(viewportIndex)
        ? viewportIndex
        : null;

  if (indices) {
    for (const idx of indices) {
      await page
        .locator('[data-viewport-uid]')
        .nth(idx)
        .locator('canvas:visible')
        .first()
        .waitFor({ state: 'visible', timeout: 30000 });
    }
  } else {
    await page
      .locator(canvasSelector)
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });
  }

  const base64: string = await page.evaluate(
    async ({ selector, indices, stableMs, timeoutMs }) => {
      type ViewportTarget = {
        canvas: HTMLCanvasElement;
        svg: SVGSVGElement | null;
        rect: { x: number; y: number; w: number; h: number };
      };

      const resolveTargets = (): ViewportTarget[] => {
        const targets: ViewportTarget[] = [];
        if (indices) {
          const vps = document.querySelectorAll('[data-viewport-uid]');
          for (const idx of indices) {
            const vp = vps[idx] as HTMLElement | undefined;
            if (!vp) {
              throw new Error(
                `checkForCanvasSnapshot: viewport ${idx} not found`
              );
            }
            const canvas =
              (vp.querySelector('canvas:not([style*="display: none"])') as
                | HTMLCanvasElement
                | null) ??
              (vp.querySelector('canvas') as HTMLCanvasElement | null);
            if (!canvas) {
              throw new Error(
                `checkForCanvasSnapshot: canvas not found in viewport ${idx}`
              );
            }
            const svg = vp.querySelector('svg') as SVGSVGElement | null;
            const r = canvas.getBoundingClientRect();
            targets.push({
              canvas,
              svg,
              rect: { x: r.x, y: r.y, w: r.width, h: r.height },
            });
          }
        } else {
          const canvas = document.querySelector(
            selector
          ) as HTMLCanvasElement | null;
          if (!canvas) {
            throw new Error(
              `checkForCanvasSnapshot: canvas not found (selector=${selector})`
            );
          }
          const vp = canvas.closest(
            '[data-viewport-uid]'
          ) as HTMLElement | null;
          const svg =
            (vp?.querySelector('svg') as SVGSVGElement | null) ?? null;
          const r = canvas.getBoundingClientRect();
          targets.push({
            canvas,
            svg,
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          });
        }
        return targets;
      };

      const svgToImage = async (
        svg: SVGSVGElement
      ): Promise<HTMLImageElement> => {
        const xml = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([xml], {
          type: 'image/svg+xml;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        try {
          const img = new Image();
          img.src = url;
          await img.decode();
          return img;
        } finally {
          URL.revokeObjectURL(url);
        }
      };

      const compositeOne = async (
        ctx: CanvasRenderingContext2D,
        target: ViewportTarget,
        ox: number,
        oy: number
      ) => {
        const { canvas, svg } = target;
        ctx.drawImage(canvas, ox, oy);
        if (svg) {
          const img = await svgToImage(svg);
          ctx.drawImage(img, ox, oy, canvas.width, canvas.height);
        }
      };

      const capture = async (): Promise<string> => {
        const targets = resolveTargets();
        if (targets.length === 1) {
          const { canvas } = targets[0];
          const out = document.createElement('canvas');
          out.width = canvas.width;
          out.height = canvas.height;
          const ctx = out.getContext('2d');
          if (!ctx) throw new Error('failed to get 2d context');
          await compositeOne(ctx, targets[0], 0, 0);
          return out.toDataURL('image/png');
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const { rect } of targets) {
          if (rect.x < minX) minX = rect.x;
          if (rect.y < minY) minY = rect.y;
          if (rect.x + rect.w > maxX) maxX = rect.x + rect.w;
          if (rect.y + rect.h > maxY) maxY = rect.y + rect.h;
        }
        const first = targets[0];
        const dpr = first.rect.w > 0 ? first.canvas.width / first.rect.w : 1;
        const out = document.createElement('canvas');
        out.width = Math.round((maxX - minX) * dpr);
        out.height = Math.round((maxY - minY) * dpr);
        const ctx = out.getContext('2d');
        if (!ctx) throw new Error('failed to get 2d context');

        for (const target of targets) {
          const ox = Math.round((target.rect.x - minX) * dpr);
          const oy = Math.round((target.rect.y - minY) * dpr);
          await compositeOne(ctx, target, ox, oy);
        }
        return out.toDataURL('image/png');
      };

      const stripPrefix = (dataUrl: string) => {
        const comma = dataUrl.indexOf(',');
        return comma === -1 ? '' : dataUrl.slice(comma + 1);
      };

      if (stableMs <= 0) {
        return stripPrefix(await capture());
      }

      const intervalMs = 100;
      const startTime = Date.now();
      let lastUrl = '';
      let firstStableAt = 0;
      while (true) {
        const url = await capture();
        const now = Date.now();
        if (url === lastUrl) {
          if (now - firstStableAt >= stableMs) {
            return stripPrefix(url);
          }
        } else {
          firstStableAt = now;
          lastUrl = url;
        }
        if (now - startTime >= timeoutMs) {
          console.warn(
            `checkForCanvasSnapshot: canvas did not stabilize after ${timeoutMs}ms; capturing last frame`
          );
          return stripPrefix(url);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    },
    { selector: canvasSelector, indices, stableMs, timeoutMs }
  );

  const buffer = Buffer.from(base64, 'base64');

  await expect(buffer).toMatchSnapshot(screenshotPath, {
    maxDiffPixelRatio: 0,
    threshold: 0.02,
  });
};

export { checkForCanvasSnapshot };
