import { expect, test as testApi } from '@playwright/test';
import type { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import { isCompatibilityMode } from './compatibilityMode';

/** Inline per-pixel comparison matching the spirit of playwright's threshold:
 *  count a pixel as different when any channel diverges by more than
 *  `threshold * 255`. The diff buffer (if provided) gets red on diverging
 *  pixels and a faded copy of the expected on identical ones. */
function diffPng(
  actual: Buffer,
  expected: Buffer,
  diff: Buffer | null,
  width: number,
  height: number,
  threshold: number
): number {
  const cutoff = threshold * 255;
  let differing = 0;
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const dr = Math.abs(actual[p] - expected[p]);
    const dg = Math.abs(actual[p + 1] - expected[p + 1]);
    const db = Math.abs(actual[p + 2] - expected[p + 2]);
    const same = Math.max(dr, dg, db) <= cutoff;
    if (!same) differing++;
    if (diff) {
      if (same) {
        // Faded baseline so diff PNGs stay legible.
        diff[p] = expected[p] / 2 + 128;
        diff[p + 1] = expected[p + 1] / 2 + 128;
        diff[p + 2] = expected[p + 2] / 2 + 128;
        diff[p + 3] = 255;
      } else {
        diff[p] = 255;
        diff[p + 1] = 0;
        diff[p + 2] = 0;
        diff[p + 3] = 255;
      }
    }
  }
  return differing;
}

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
  /**
   * Hide annotation text boxes (the `g[data-annotation-uid]` groups that
   * `drawTextBox` emits) while rasterizing the SVG overlay. Glyph rendering
   * shifts by a few sub-pixels across machines and GL backends, so the label is
   * the single largest source of environment-dependent diffs even when the line,
   * handles and underlying image are pixel-identical. Hide it here and assert
   * the value separately with `expectAnnotationText` so the snapshot only covers
   * deterministic geometry. The label is restored after capture. Default false.
   */
  hideAnnotationText?: boolean;
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
    hideAnnotationText = false,
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
    async ({ selector, indices, stableMs, timeoutMs, hideAnnotationText }) => {
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
        // Optionally hide annotation labels for the same reason: font glyph
        // rasterization drifts ±1 sub-pixel between environments. The value is
        // asserted separately via expectAnnotationText.
        const textNodes = hideAnnotationText
          ? Array.from(
              svg.querySelectorAll<SVGElement>('g[data-annotation-uid]')
            )
          : [];
        const textPrevDisplay: string[] = [];
        textNodes.forEach((n) => {
          textPrevDisplay.push(n.style.display);
          n.style.display = 'none';
        });
        const xml = new XMLSerializer().serializeToString(svg);
        textNodes.forEach((n, i) => {
          n.style.display = textPrevDisplay[i];
        });
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
    { selector: canvasSelector, indices, stableMs, timeoutMs, hideAnnotationText }
  );

  const buffer = Buffer.from(base64, 'base64');

  // Paths containing `..` reference a shared baseline owned by a different
  // spec (e.g. a generic-viewport test that should match the legacy stack
  // baseline). Playwright's toMatchSnapshot enforces that the resolved file
  // stays inside the test's own snapshot/output directory, so cross-spec
  // sharing has to bypass it and compare buffers manually.
  if (screenshotPath.includes('..')) {
    await compareAgainstSharedBaseline(buffer, screenshotPath, {
      threshold,
      maxDiffPixelRatio,
    });
    return;
  }

  const effectiveScreenshotPath = resolveCompatScreenshotPath(screenshotPath);

  await expect(buffer).toMatchSnapshot(effectiveScreenshotPath, {
    maxDiffPixelRatio,
    threshold,
  });
};

/**
 * In compatibility mode, segmentation-heavy tests render with subtly different
 * edge anti-aliasing than the legacy path, so we keep a sibling `compat-<name>`
 * baseline next to the legacy one. If that compat baseline already exists we
 * use it; otherwise compat falls back to the legacy baseline so tests that
 * don't visibly diverge keep sharing one source of truth.
 *
 * Compat baselines are only created on demand: run with
 * `--update-snapshots=all` and a `-g` filter that selects the tests you want
 * to fork. Plain `--update-snapshots` (Playwright's default `missing` mode)
 * does NOT auto-create compat baselines — that would silently fork every
 * compat-mode test instead of only the segmentation ones.
 */
function resolveCompatScreenshotPath(screenshotPath: string): string {
  if (!isCompatibilityMode()) return screenshotPath;
  const baseName = path.basename(screenshotPath);
  if (baseName.startsWith('compat-')) return screenshotPath;
  const compatName = `compat-${baseName}`;
  const info = testApi.info();
  const compatFullPath = info.snapshotPath(compatName);
  if (fs.existsSync(compatFullPath)) {
    return compatName;
  }
  if (info.config.updateSnapshots === 'all') {
    return compatName;
  }
  return screenshotPath;
}

/**
 * Compares an in-memory PNG buffer against a baseline owned by a sibling
 * spec. The path is resolved relative to where Playwright would have stored
 * a same-spec baseline (`tests/screenshots/<project>/<testFile>/`), so
 * `../../foo.spec.ts/bar.png` lands at `tests/screenshots/<project>/foo.spec.ts/bar.png`.
 *
 * On mismatch we still emit -actual.png / -diff.png attachments into the
 * test's output dir, so the HTML report and our diff viewer behave the same
 * as for first-party baselines.
 */
async function compareAgainstSharedBaseline(
  buffer: Buffer,
  screenshotPath: string,
  opts: { threshold: number; maxDiffPixelRatio: number }
): Promise<void> {
  const info = testApi.info();
  // Use playwright's own snapshot-path resolver to find this test's baseline
  // directory, then traverse from there. Avoids us guessing config.rootDir vs
  // project.testDir semantics across playwright versions.
  const sameSpecAnchor = info.snapshotPath('__compat_anchor__.png');
  const snapshotDir = path.dirname(sameSpecAnchor);
  // Mirror Playwright's sanitizeForFilePath on the leaf filename so a shared
  // reference like `../../legacy.spec.ts/dcm_x.1.2.png` resolves to the real
  // on-disk file `dcm-x-1-2.png` that Playwright wrote from the legacy spec.
  // The same regex Playwright uses (playwright-core/lib/server/utils/fileUtils.js).
  const dirPart = path.dirname(screenshotPath);
  const ext = path.extname(screenshotPath);
  const stem = path.basename(screenshotPath, ext);
  const sanitizedStem = stem.replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x2C\x2E-\x2F\x3A-\x40\x5B-\x60\x7B-\x7F]+/g,
    '-'
  );
  const expectedPath = path.resolve(
    snapshotDir,
    dirPart,
    `${sanitizedStem}${ext}`
  );
  const screenshotBase = path.basename(screenshotPath, path.extname(screenshotPath));

  const writeAttachments = async (
    actual: Buffer,
    expected: Buffer | null,
    diff: Buffer | null
  ) => {
    const stamp = `${screenshotBase}-${Date.now()}`;
    const actualPath = info.outputPath(`${stamp}-actual.png`);
    fs.writeFileSync(actualPath, actual);
    await info.attach(`${screenshotBase}-actual`, {
      path: actualPath,
      contentType: 'image/png',
    });
    if (expected) {
      const expectedOut = info.outputPath(`${stamp}-expected.png`);
      fs.writeFileSync(expectedOut, expected);
      await info.attach(`${screenshotBase}-expected`, {
        path: expectedOut,
        contentType: 'image/png',
      });
    }
    if (diff) {
      const diffOut = info.outputPath(`${stamp}-diff.png`);
      fs.writeFileSync(diffOut, diff);
      await info.attach(`${screenshotBase}-diff`, {
        path: diffOut,
        contentType: 'image/png',
      });
    }
  };

  if (!fs.existsSync(expectedPath)) {
    if (info.config.updateSnapshots === 'all' || info.config.updateSnapshots === 'missing') {
      fs.mkdirSync(path.dirname(expectedPath), { recursive: true });
      fs.writeFileSync(expectedPath, buffer);
      console.warn(`Wrote shared baseline: ${expectedPath}`);
      return;
    }
    await writeAttachments(buffer, null, null);
    throw new Error(
      `Shared baseline not found at ${expectedPath} (referenced via ${screenshotPath}). ` +
        `Run with --update-snapshots from the legacy spec to create it.`
    );
  }

  const expectedBuffer = fs.readFileSync(expectedPath);
  const actual = PNG.sync.read(buffer);
  const expected = PNG.sync.read(expectedBuffer);

  if (actual.width !== expected.width || actual.height !== expected.height) {
    const diffImage = new PNG({ width: actual.width, height: actual.height });
    await writeAttachments(buffer, expectedBuffer, PNG.sync.write(diffImage));
    throw new Error(
      `Shared baseline size mismatch: expected ${expected.width}x${expected.height} ` +
        `(${expectedPath}), received ${actual.width}x${actual.height}.`
    );
  }

  const diffImage = new PNG({ width: actual.width, height: actual.height });
  const totalPixels = actual.width * actual.height;
  const diffPixels = diffPng(
    actual.data as Buffer,
    expected.data as Buffer,
    diffImage.data as Buffer,
    actual.width,
    actual.height,
    opts.threshold
  );
  const ratio = totalPixels > 0 ? diffPixels / totalPixels : 0;
  if (ratio > opts.maxDiffPixelRatio) {
    await writeAttachments(buffer, expectedBuffer, PNG.sync.write(diffImage));
    throw new Error(
      `Shared baseline mismatch: ${diffPixels} pixels (ratio ${ratio.toFixed(4)}) ` +
        `differ vs ${expectedPath}, above maxDiffPixelRatio ${opts.maxDiffPixelRatio}.`
    );
  }
}

export { checkForCanvasSnapshot };
