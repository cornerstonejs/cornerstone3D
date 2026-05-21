import { expect } from '@playwright/test';
import type { Page } from 'playwright';
import { resolveCompatibilityScreenshotPath } from './compatibilityMode';

interface CheckForCanvasSnapshotOptions {
  /**
   * Wait until the captured PNG buffer is identical for this many
   * consecutive milliseconds before snapshotting. Set to 0 for always-
   * animating viewports (video, CINE) where stability never converges.
   */
  stableMs?: number;
  /** Cap on stability waiting; falls back to last capture after this. */
  timeoutMs?: number;
  /** Per-pixel color tolerance passed to toMatchSnapshot. Default 0.005. */
  threshold?: number;
  /** Allowed fraction of differing pixels. Default 0. */
  maxDiffPixelRatio?: number;
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
  const {
    stableMs = 300,
    timeoutMs = 8000,
    threshold = 0.005,
    maxDiffPixelRatio = 0,
  } = options;
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
        // The svg-layer is sized via CSS (`width: 100%; height: 100%`) and has
        // no explicit width/height attributes. Once serialized into a data URL
        // and loaded as an <img>, that CSS no longer applies, so the browser
        // falls back to SVG's default 300x150 viewport — clipping anything
        // beyond (e.g. crosshair reference lines drawn in absolute canvas
        // pixels). Stamp explicit width/height attributes so the SVG renders
        // at the real canvas size before drawImage scales it.
        const rect = svg.getBoundingClientRect();
        const cssW = rect.width || svg.clientWidth || 0;
        const cssH = rect.height || svg.clientHeight || 0;
        const prevW = svg.getAttribute('width');
        const prevH = svg.getAttribute('height');
        if (cssW > 0 && cssH > 0) {
          svg.setAttribute('width', String(cssW));
          svg.setAttribute('height', String(cssH));
        }
        // Hide ephemeral cursors (brush, threshold, etc.) so snapshots stay
        // stable across runs — they track the last mouse position, which
        // drifts ±1px between runs and produces anti-aliased diffs along the
        // cursor stroke. Anything tagged with data-id="brush-cursor" gets
        // its display toggled off during serialization, then restored.
        const cursorNodes = svg.querySelectorAll<SVGElement>(
          '[data-id="brush-cursor"]'
        );
        const cursorPrevDisplay: string[] = [];
        cursorNodes.forEach((n) => {
          cursorPrevDisplay.push(n.style.display);
          n.style.display = 'none';
        });
        const xml = new XMLSerializer().serializeToString(svg);
        cursorNodes.forEach((n, i) => {
          n.style.display = cursorPrevDisplay[i];
        });
        if (prevW === null) svg.removeAttribute('width');
        else svg.setAttribute('width', prevW);
        if (prevH === null) svg.removeAttribute('height');
        else svg.setAttribute('height', prevH);
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

      const isCanvasUniform = (canvas: HTMLCanvasElement): boolean => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0) return true;
        const x = (frac: number) =>
          Math.min(w - 1, Math.max(0, Math.floor(w * frac)));
        const y = (frac: number) =>
          Math.min(h - 1, Math.max(0, Math.floor(h * frac)));
        const points: Array<[number, number]> = [
          [x(0), y(0)],
          [x(1), y(0)],
          [x(0), y(1)],
          [x(1), y(1)],
          [x(0.5), y(0.5)],
          [x(0.25), y(0.25)],
          [x(0.75), y(0.25)],
          [x(0.25), y(0.75)],
          [x(0.75), y(0.75)],
          [x(0.5), y(0.25)],
          [x(0.25), y(0.5)],
          [x(0.75), y(0.5)],
          [x(0.5), y(0.75)],
        ];
        let first: string | null = null;
        try {
          for (const [px, py] of points) {
            const d = ctx.getImageData(px, py, 1, 1).data;
            const key = `${d[0]},${d[1]},${d[2]},${d[3]}`;
            if (first === null) first = key;
            else if (key !== first) return false;
          }
        } catch {
          return false;
        }
        return true;
      };

      const capture = async (): Promise<{
        url: string;
        uniform: boolean;
      }> => {
        const targets = resolveTargets();
        let out: HTMLCanvasElement;
        if (targets.length === 1) {
          const { canvas } = targets[0];
          out = document.createElement('canvas');
          out.width = canvas.width;
          out.height = canvas.height;
          const ctx = out.getContext('2d');
          if (!ctx) throw new Error('failed to get 2d context');
          await compositeOne(ctx, targets[0], 0, 0);
        } else {
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
          const dpr =
            first.rect.w > 0 ? first.canvas.width / first.rect.w : 1;
          out = document.createElement('canvas');
          out.width = Math.round((maxX - minX) * dpr);
          out.height = Math.round((maxY - minY) * dpr);
          const ctx = out.getContext('2d');
          if (!ctx) throw new Error('failed to get 2d context');

          for (const target of targets) {
            const ox = Math.round((target.rect.x - minX) * dpr);
            const oy = Math.round((target.rect.y - minY) * dpr);
            await compositeOne(ctx, target, ox, oy);
          }
        }
        return {
          url: out.toDataURL('image/png'),
          uniform: isCanvasUniform(out),
        };
      };

      const stripPrefix = (dataUrl: string) => {
        const comma = dataUrl.indexOf(',');
        return comma === -1 ? '' : dataUrl.slice(comma + 1);
      };

      if (stableMs <= 0) {
        return stripPrefix((await capture()).url);
      }

      // Debounce stability against cornerstone activity. We listen for:
      //   - render events on each viewport element (paint occurred)
      //   - load events on the global eventTarget (image/volume arrived)
      // Anything that resets the idle timer means more content is on the way,
      // so a labelmap-only canvas waiting on a volume to load doesn't get
      // declared stable prematurely.
      const elementEvents = [
        'CORNERSTONE_IMAGE_RENDERED',
        'CORNERSTONE_VOLUME_NEW_IMAGE',
        'CORNERSTONE_STACK_NEW_IMAGE',
      ];
      const targetEvents = [
        'CORNERSTONE_IMAGE_LOADED',
        'CORNERSTONE_VOLUME_LOADED',
        'CORNERSTONE_IMAGE_VOLUME_LOADING_COMPLETED',
      ];
      const lastActivity = { ts: 0 };
      const onActivity = () => {
        lastActivity.ts = Date.now();
      };
      const seedTargets = resolveTargets();
      const listenerEls = new Set<HTMLElement>();
      for (const t of seedTargets) {
        const vp = t.canvas.closest('[data-viewport-uid]') as HTMLElement | null;
        if (vp) listenerEls.add(vp);
      }
      for (const el of listenerEls) {
        for (const evt of elementEvents)
          el.addEventListener(evt, onActivity);
      }
      const cs = (
        window as unknown as {
          cornerstone?: { eventTarget?: EventTarget };
        }
      ).cornerstone;
      const csTarget = cs?.eventTarget;
      if (csTarget) {
        for (const evt of targetEvents) csTarget.addEventListener(evt, onActivity);
      }
      const detach = () => {
        for (const el of listenerEls) {
          for (const evt of elementEvents)
            el.removeEventListener(evt, onActivity);
        }
        if (csTarget) {
          for (const evt of targetEvents)
            csTarget.removeEventListener(evt, onActivity);
        }
      };

      try {
        const intervalMs = 100;
        const loadTimeoutMs = Math.min(3000, timeoutMs);
        const startTime = Date.now();
        let contentSeen = false;
        let lastUrl = '';
        let urlStableAt = 0;
        while (true) {
          const { url, uniform } = await capture();
          const now = Date.now();

          if (!contentSeen) {
            // A uniformly-blank canvas means rendering hasn't happened yet.
            // Wait for content, or fall through after loadTimeoutMs (covers
            // legitimately-uniform final images like an all-black slice).
            if (!uniform || now - startTime >= loadTimeoutMs) {
              contentSeen = true;
              lastUrl = url;
              urlStableAt = now;
            }
          } else {
            if (url !== lastUrl) {
              lastUrl = url;
              urlStableAt = now;
            }
            const urlIdle = now - urlStableAt;
            const eventIdle =
              lastActivity.ts > 0 ? now - lastActivity.ts : Infinity;
            // Two acceptance paths:
            //   1. Events have fired and have been idle for stableMs (the
            //      common case when async loads are involved).
            //   2. No cornerstone events ever fired (e.g., page fully
            //      rendered before the listener attached). After loadTimeoutMs
            //      we fall back to plain url stability.
            const eventBased =
              lastActivity.ts > 0 &&
              eventIdle >= stableMs &&
              urlIdle >= stableMs;
            const noEventFallback =
              lastActivity.ts === 0 &&
              now - startTime >= loadTimeoutMs &&
              urlIdle >= stableMs;
            if (eventBased || noEventFallback) {
              return stripPrefix(url);
            }
          }

          if (now - startTime >= timeoutMs) {
            console.warn(
              `checkForCanvasSnapshot: ${
                contentSeen
                  ? `did not stabilize after ${timeoutMs}ms`
                  : `canvas content never appeared in ${timeoutMs}ms (still uniform)`
              }; capturing last frame`
            );
            return stripPrefix(url);
          }
          await new Promise((r) => setTimeout(r, intervalMs));
        }
      } finally {
        detach();
      }
    },
    { selector: canvasSelector, indices, stableMs, timeoutMs }
  );

  const buffer = Buffer.from(base64, 'base64');

  await expect(buffer).toMatchSnapshot(
    resolveCompatibilityScreenshotPath(screenshotPath),
    {
      maxDiffPixelRatio,
      threshold,
    }
  );
};

export { checkForCanvasSnapshot };
