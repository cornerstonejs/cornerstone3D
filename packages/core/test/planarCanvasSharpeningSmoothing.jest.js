import { describe, it, expect, jest } from '@jest/globals';
import { applyCanvasSharpeningSmoothing } from '../src/RenderingEngine/GenericViewport/Planar/planarCanvasSharpeningSmoothing';
import { createSharpeningRenderPass } from '../src/RenderingEngine/renderPasses/sharpeningRenderPass';
import { createSmoothingRenderPass } from '../src/RenderingEngine/renderPasses/smoothingRenderPass';

const WIDTH = 41;
const HEIGHT = 23;

/** Pixels of random colours with an opaque alpha, the same on each call. */
function createPixels() {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  let seed = 7;

  for (let i = 0; i < pixels.length; i++) {
    seed = (seed * 16807) % 2147483647;
    pixels[i] = i % 4 === 3 ? 255 : seed % 256;
  }

  return pixels;
}

/** A canvas and a 2D context that hold `pixels` and record their calls. */
function createCanvas(pixels) {
  const canvas = { width: WIDTH, height: HEIGHT };
  const context = {
    getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(pixels) })),
    putImageData: jest.fn(),
  };

  return { canvas, context };
}

/**
 * The convolution of the GPU pass: every weight of its kernel at once, with
 * the edge pixels repeated outside the picture, divided by the sum of the
 * kernel, rounded once.
 */
function convolveAsTheGpuPass(pixels, renderPass) {
  const kernel = renderPass.getKernel();
  const dimension = renderPass.getKernelDimension();
  const half = (dimension - 1) / 2;
  const weight = kernel.reduce((sum, value) => sum + value, 0);
  const result = new Uint8ClampedArray(pixels);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;

        for (let ky = 0; ky < dimension; ky++) {
          const row = Math.min(HEIGHT - 1, Math.max(0, y + ky - half));

          for (let kx = 0; kx < dimension; kx++) {
            const column = Math.min(WIDTH - 1, Math.max(0, x + kx - half));
            sum +=
              pixels[(row * WIDTH + column) * 4 + channel] *
              kernel[ky * dimension + kx];
          }
        }

        result[(y * WIDTH + x) * 4 + channel] = Math.round(sum / weight);
      }
    }
  }

  return result;
}

function maxDifference(a, b) {
  let max = 0;

  for (let i = 0; i < a.length; i++) {
    max = Math.max(max, Math.abs(a[i] - b[i]));
  }

  return max;
}

function applyToPixels(properties) {
  const pixels = createPixels();
  const { canvas, context } = createCanvas(pixels);

  applyCanvasSharpeningSmoothing(canvas, context, properties);

  return context.putImageData.mock.calls[0][0].data;
}

describe('applyCanvasSharpeningSmoothing', () => {
  it('sharpens as the 3 x 3 kernel of the GPU pass', () => {
    for (const sharpening of [0.5, 2]) {
      expect(
        maxDifference(
          applyToPixels({ sharpening }),
          convolveAsTheGpuPass(
            createPixels(),
            createSharpeningRenderPass(sharpening)
          )
        )
      ).toBe(0);
    }
  });

  it('smooths in two passes of 15 weights as the 225 weights of the GPU pass, within 1', () => {
    for (const smoothing of [3, 10, 2000]) {
      expect(
        maxDifference(
          applyToPixels({ smoothing }),
          convolveAsTheGpuPass(
            createPixels(),
            createSmoothingRenderPass(smoothing)
          )
        )
      ).toBeLessThanOrEqual(1);
    }
  });

  it('shows the sharpening alone when both are above 0, as the GPU passes do', () => {
    expect(
      maxDifference(
        applyToPixels({ sharpening: 1, smoothing: 5 }),
        applyToPixels({ sharpening: 1 })
      )
    ).toBe(0);
  });

  it('keeps the alpha channel', () => {
    const pixels = createPixels();

    for (let i = 3; i < pixels.length; i += 4) {
      pixels[i] = i % 7;
    }

    const { canvas, context } = createCanvas(pixels);

    applyCanvasSharpeningSmoothing(canvas, context, { smoothing: 4 });

    const result = context.putImageData.mock.calls[0][0].data;

    for (let i = 3; i < pixels.length; i += 4) {
      expect(result[i]).toBe(pixels[i]);
    }
  });

  it('reads and writes nothing when both are 0 or not set', () => {
    for (const properties of [undefined, {}, { sharpening: 0, smoothing: 0 }]) {
      const { canvas, context } = createCanvas(createPixels());

      applyCanvasSharpeningSmoothing(canvas, context, properties);

      expect(context.getImageData).not.toHaveBeenCalled();
      expect(context.putImageData).not.toHaveBeenCalled();
    }
  });
});
