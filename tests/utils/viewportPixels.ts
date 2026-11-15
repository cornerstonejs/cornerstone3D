import type { Page } from '@playwright/test';

export type ViewportPixels = {
  width: number;
  height: number;
  /** RGBA bytes, four per pixel, rows from the top. */
  data: Buffer;
};

export type ViewportPixelDifference = {
  sameSize: boolean;
  /** Largest difference of one channel (R, G, B or A) at any pixel, 0 to 255. */
  maxDifference: number;
  /** Number of pixels where any channel differs. */
  differingPixels: number;
};

type ReadViewportPixelsOptions = {
  /** The pixels must stay the same for this long before they are returned. */
  stableMs?: number;
  /** Longest wait for stable pixels; the last read is returned after it. */
  timeoutMs?: number;
};

/**
 * Reads the pixels of the visible canvas of the Nth `[data-viewport-uid]`
 * element in the page, without the SVG layer. The canvas is drawn into a
 * scratch 2D canvas and read there. The read repeats until two reads
 * `stableMs` apart are the same, so a render that is still running is not
 * captured half way.
 */
export async function readViewportPixels(
  page: Page,
  viewportIndex = 0,
  options: ReadViewportPixelsOptions = {}
): Promise<ViewportPixels> {
  const { stableMs = 300, timeoutMs = 10000 } = options;
  const result = await page.evaluate(
    async ({ viewportIndex, stableMs, timeoutMs }) => {
      const read = () => {
        const viewportElement = document.querySelectorAll(
          '[data-viewport-uid]'
        )[viewportIndex] as HTMLElement | undefined;

        if (!viewportElement) {
          throw new Error(
            `readViewportPixels: viewport ${viewportIndex} not found`
          );
        }

        const canvas =
          (viewportElement.querySelector(
            'canvas:not([style*="display: none"])'
          ) as HTMLCanvasElement | null) ??
          (viewportElement.querySelector('canvas') as HTMLCanvasElement | null);

        if (!canvas) {
          throw new Error(
            `readViewportPixels: canvas not found in viewport ${viewportIndex}`
          );
        }

        const scratch = document.createElement('canvas');

        scratch.width = canvas.width;
        scratch.height = canvas.height;

        const context = scratch.getContext('2d');

        if (!context) {
          throw new Error('readViewportPixels: no 2d context');
        }

        context.drawImage(canvas, 0, 0);

        const { data } = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );
        let binary = '';

        for (let start = 0; start < data.length; start += 0x8000) {
          binary += String.fromCharCode(
            ...data.subarray(start, start + 0x8000)
          );
        }

        return {
          width: canvas.width,
          height: canvas.height,
          base64: btoa(binary),
        };
      };

      const wait = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      const deadline = Date.now() + timeoutMs;
      let previous = read();

      while (Date.now() < deadline) {
        await wait(stableMs);

        const current = read();

        if (
          current.width === previous.width &&
          current.height === previous.height &&
          current.base64 === previous.base64
        ) {
          return current;
        }

        previous = current;
      }

      return previous;
    },
    { viewportIndex, stableMs, timeoutMs }
  );

  return {
    width: result.width,
    height: result.height,
    data: Buffer.from(result.base64, 'base64'),
  };
}

/** Compares two pixel reads channel by channel. */
export function compareViewportPixels(
  first: ViewportPixels,
  second: ViewportPixels
): ViewportPixelDifference {
  if (first.width !== second.width || first.height !== second.height) {
    return {
      sameSize: false,
      maxDifference: 255,
      differingPixels: Math.max(
        first.width * first.height,
        second.width * second.height
      ),
    };
  }

  let maxDifference = 0;
  let differingPixels = 0;

  for (let offset = 0; offset < first.data.length; offset += 4) {
    let pixelDifference = 0;

    for (let channel = 0; channel < 4; channel++) {
      pixelDifference = Math.max(
        pixelDifference,
        Math.abs(first.data[offset + channel] - second.data[offset + channel])
      );
    }

    if (pixelDifference > 0) {
      differingPixels++;
    }

    maxDifference = Math.max(maxDifference, pixelDifference);
  }

  return { sameSize: true, maxDifference, differingPixels };
}

/**
 * Counts the pixels that are not background. The background is the colour of
 * the top left pixel, and a pixel is content when one of its R, G or B values
 * differs from it by more than `tolerance`. Two blank canvases compare equal,
 * so a test that compares pictures checks this count first.
 */
export function countContentPixels(
  pixels: ViewportPixels,
  tolerance = 8
): number {
  const { data } = pixels;
  let contentPixels = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    if (
      Math.abs(data[offset] - data[0]) > tolerance ||
      Math.abs(data[offset + 1] - data[1]) > tolerance ||
      Math.abs(data[offset + 2] - data[2]) > tolerance
    ) {
      contentPixels++;
    }
  }

  return contentPixels;
}

/**
 * Counts the pixels where R, G or B of two reads of the same size differ by
 * more than `tolerance`. A pixel whose byte in `ignore` is not 0 is not
 * counted.
 */
export function countPixelsDifferingBy(
  first: ViewportPixels,
  second: ViewportPixels,
  tolerance: number,
  ignore?: Uint8Array
): number {
  let pixels = 0;

  for (let offset = 0; offset < first.data.length; offset += 4) {
    if (ignore?.[offset / 4]) {
      continue;
    }

    if (
      Math.abs(first.data[offset] - second.data[offset]) > tolerance ||
      Math.abs(first.data[offset + 1] - second.data[offset + 1]) > tolerance ||
      Math.abs(first.data[offset + 2] - second.data[offset + 2]) > tolerance
    ) {
      pixels++;
    }
  }

  return pixels;
}
