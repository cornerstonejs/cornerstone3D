import { getSharpeningKernel } from '../../renderPasses/sharpeningRenderPass';
import {
  getSmoothingBlend,
  SMOOTHING_KERNEL_SIZE,
  SMOOTHING_SIGMA,
} from '../../renderPasses/smoothingRenderPass';
import type { SharpeningSmoothing } from '../../renderPasses/createSharpeningSmoothingRenderPasses';

/**
 * The normalized 1D Gaussian of the smoothing. The 2D kernel of the GPU pass
 * is its outer product with itself, so two passes of these weights give the
 * same blur as the 225 weights of the GPU pass.
 */
function getGaussianWeights(): Float32Array {
  const weights = new Float32Array(SMOOTHING_KERNEL_SIZE);
  const mean = (SMOOTHING_KERNEL_SIZE - 1) / 2;
  let sum = 0;

  for (let i = 0; i < SMOOTHING_KERNEL_SIZE; i++) {
    const d = i - mean;
    weights[i] = Math.exp(-(d * d) / (2 * SMOOTHING_SIGMA * SMOOTHING_SIGMA));
    sum += weights[i];
  }

  for (let i = 0; i < SMOOTHING_KERNEL_SIZE; i++) {
    weights[i] /= sum;
  }

  return weights;
}

/**
 * The index of each position from `-half` to `length - 1 + half`, shifted by
 * `half`, clamped to the picture: outside the picture, the edge pixel
 * repeats, as the GPU pass reads its texture.
 */
function getClampedIndices(length: number, half: number): Int32Array {
  const indices = new Int32Array(length + 2 * half);

  for (let i = 0; i < indices.length; i++) {
    indices[i] = Math.min(length - 1, Math.max(0, i - half));
  }

  return indices;
}

/**
 * The 3 x 3 sharpening of the RGB channels of `pixels`, with the edge pixels
 * repeated outside the picture. The alpha channel is kept.
 */
function sharpen(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  intensity: number
): void {
  const around = -intensity;
  const middle = getSharpeningKernel(intensity)[4];
  const source = new Uint8ClampedArray(pixels);
  const columns = getClampedIndices(width, 1);
  const rows = getClampedIndices(height, 1);

  for (let y = 0; y < height; y++) {
    const above = rows[y] * width;
    const row = y * width;
    const below = rows[y + 2] * width;

    for (let x = 0; x < width; x++) {
      const left = columns[x];
      const right = columns[x + 2];
      const out = (row + x) * 4;
      const aboveLeft = (above + left) * 4;
      const aboveMiddle = (above + x) * 4;
      const aboveRight = (above + right) * 4;
      const middleLeft = (row + left) * 4;
      const middleRight = (row + right) * 4;
      const belowLeft = (below + left) * 4;
      const belowMiddle = (below + x) * 4;
      const belowRight = (below + right) * 4;

      for (let channel = 0; channel < 3; channel++) {
        const neighbours =
          source[aboveLeft + channel] +
          source[aboveMiddle + channel] +
          source[aboveRight + channel] +
          source[middleLeft + channel] +
          source[middleRight + channel] +
          source[belowLeft + channel] +
          source[belowMiddle + channel] +
          source[belowRight + channel];

        pixels[out + channel] = Math.round(
          middle * source[out + channel] + around * neighbours
        );
      }
    }
  }
}

/**
 * The smoothing of the RGB channels of `pixels`: the picture mixed with its
 * Gaussian blur by `getSmoothingBlend`. The blur runs as a pass along the
 * rows and a pass along the columns, with the edge pixels repeated outside
 * the picture. The alpha channel is kept.
 */
function smooth(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  intensity: number
): void {
  const blend = getSmoothingBlend(intensity);
  const weights = getGaussianWeights();
  const size = SMOOTHING_KERNEL_SIZE;
  const half = (size - 1) / 2;
  const columns = getClampedIndices(width, half);
  const rows = getClampedIndices(height, half);
  const blurred = new Float32Array(width * height * 3);

  for (let y = 0; y < height; y++) {
    const row = y * width;

    for (let x = 0; x < width; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;

      for (let i = 0; i < size; i++) {
        const index = (row + columns[x + i]) * 4;
        const weight = weights[i];
        red += pixels[index] * weight;
        green += pixels[index + 1] * weight;
        blue += pixels[index + 2] * weight;
      }

      const out = (row + x) * 3;
      blurred[out] = red;
      blurred[out + 1] = green;
      blurred[out + 2] = blue;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;

      for (let i = 0; i < size; i++) {
        const index = (rows[y + i] * width + x) * 3;
        const weight = weights[i];
        red += blurred[index] * weight;
        green += blurred[index + 1] * weight;
        blue += blurred[index + 2] * weight;
      }

      const out = (y * width + x) * 4;
      pixels[out] = Math.round((1 - blend) * pixels[out] + blend * red);
      pixels[out + 1] = Math.round(
        (1 - blend) * pixels[out + 1] + blend * green
      );
      pixels[out + 2] = Math.round(
        (1 - blend) * pixels[out + 2] + blend * blue
      );
    }
  }
}

/**
 * Whether a sharpening or a smoothing changes the picture: one of the two is
 * above 0.
 */
export function hasSharpeningOrSmoothing({
  sharpening = 0,
  smoothing = 0,
}: SharpeningSmoothing = {}): boolean {
  return sharpening > 0 || smoothing > 0;
}

/**
 * Applies the sharpening or the smoothing of the GPU render passes to the
 * picture of a 2D canvas, after the CPU draw step has drawn the frame with
 * every layer. vtk.js draws each render pass of a view on its own, so with
 * both above 0 the GPU picture shows only the sharpening, the last pass; the
 * canvas shows the same. Nothing runs when both are 0.
 *
 * @param canvas - The canvas with the drawn frame.
 * @param context - The 2D context of the canvas.
 * @param settings - The sharpening and the smoothing.
 */
export function applyCanvasSharpeningSmoothing(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  settings: SharpeningSmoothing = {}
): void {
  const { sharpening = 0, smoothing = 0 } = settings;
  const { width, height } = canvas;

  if (!hasSharpeningOrSmoothing(settings) || !width || !height) {
    return;
  }

  const imageData = context.getImageData(0, 0, width, height);

  if (sharpening > 0) {
    sharpen(imageData.data, width, height, sharpening);
  } else {
    smooth(imageData.data, width, height, smoothing);
  }

  context.putImageData(imageData, 0, 0);
}
