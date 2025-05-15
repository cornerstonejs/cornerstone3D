import type { Types } from '@cornerstonejs/core';
import type { FanShapeCorners, RefinementOptions } from './types';

/**
 * Pick the four corner points P1–P4 from the convex‐hull of the fan:
 *   P1 = inner‐left   (top arc, leftmost)
 *   P4 = inner‐right  (top arc, rightmost)
 *   P2 = outer‐left   (full‐hull leftmost)
 *   P3 = outer‐right  (full‐hull rightmost)
 * Allows ±slack px in the top‐arc grouping.
 *
 * @param {Array<Types.Point2>} hull
 * @param {number} [slack=3]  vertical tolerance (px) around the top arc
 * @returns {FanShapeCorners} The four corner points
 */
export function pickPoints(
  hull: Array<Types.Point2>,
  slack = 3
): FanShapeCorners {
  if (hull.length === 0) {
    throw new Error('Convex hull is empty');
  }

  // 1) Find the minimum y on the hull (the "top" of the fan)
  const ys = hull.map((p) => p[1]);
  const yMin = Math.min(...ys);

  // 2) Collect all hull points whose y is within ±slack of yMin
  let topPts = hull.filter((p) => Math.abs(p[1] - yMin) <= slack);

  // If that grouping fails (too few points), fallback to the two smallest-y points
  if (topPts.length < 2) {
    topPts = hull
      .slice()
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2);
  }

  // 3) P1, P4: inner arc extremes among those topPts
  const P1 = topPts.reduce((best, p) => (p[0] < best[0] ? p : best), topPts[0]);
  const P4 = topPts.reduce((best, p) => (p[0] > best[0] ? p : best), topPts[0]);

  // 4) P2, P3: global x-extrema on the full hull
  const P2 = hull.reduce((best, p) => (p[0] < best[0] ? p : best), hull[0]);
  const P3 = hull.reduce((best, p) => (p[0] > best[0] ? p : best), hull[0]);

  return { P1, P2, P3, P4 };
}

/**
 * Compute a single-channel edge magnitude buffer via the Sobel operator.
 *
 * @param {Uint8Array|Uint8ClampedArray|Array<number>} buffer
 *   Input image buffer: length = w*h (grayscale), w*h*3 (RGB), or w*h*4 (RGBA).
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array} edgeBuf   length = width*height, Sobel magnitude
 */
export function computeEdgeBuffer(buffer, width, height) {
  const total = width * height;
  const channels = buffer.length / total;
  if (![1, 3, 4].includes(channels)) {
    throw new Error('Buffer must be 1,3 or 4 channels per pixel');
  }

  // 1) Build a grayscale array
  const gray = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    if (channels === 1) {
      gray[i] = buffer[i];
    } else {
      const base = i * channels;
      const r = buffer[base];
      const g = buffer[base + 1];
      const b = buffer[base + 2];
      // standard luma
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }

  // 2) Prepare output
  const edgeBuf = new Float32Array(total);

  // 3) Sobel kernels
  // Gx = [-1 0 +1; -2 0 +2; -1 0 +1]
  // Gy = [+1 +2 +1;  0  0  0; -1 -2 -1]
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      // indices of 3×3 neighborhood
      const i00 = idx - width - 1;
      const i01 = idx - width;
      const i02 = idx - width + 1;
      const i10 = idx - 1;
      const i11 = idx;
      const i12 = idx + 1;
      const i20 = idx + width - 1;
      const i21 = idx + width;
      const i22 = idx + width + 1;

      // compute Gx
      const gx =
        -gray[i00] +
        gray[i02] +
        -2 * gray[i10] +
        2 * gray[i12] +
        -gray[i20] +
        gray[i22];

      // compute Gy
      const gy =
        gray[i00] +
        2 * gray[i01] +
        gray[i02] -
        gray[i20] -
        2 * gray[i21] -
        gray[i22];

      // magnitude
      edgeBuf[idx] = Math.hypot(gx, gy);
    }
  }

  // edges along the border remain zero
  return edgeBuf;
}

/**
 * Refine each rough corner by scanning in a preferred direction
 * and selecting the strongest edge response.
 *
 * @param {Float32Array} edgeBuf - Single-channel edge magnitude, length w*h
 * @param {number} width
 * @param {number} height
 * @param {FanShapeCorners} rough - Rough corner locations
 * @param {RefinementOptions} [opts] - Options for refinement
 * @param {number} [opts.maxDist=15] - max pixels to search along the direction
 * @param {number} [opts.step=0.5] - sampling resolution
 * @returns {FanShapeCorners} - refined points
 */
export function refineCornersDirectional(
  edgeBuf,
  width,
  height,
  rough,
  opts: RefinementOptions = {}
): FanShapeCorners {
  const { maxDist = 15, step = 0.5 } = opts;

  const directions = {
    P1: { dx: -1, dy: -1 },
    P2: { dx: -1, dy: +1 },
    P3: { dx: +1, dy: +1 },
    P4: { dx: +1, dy: -1 },
  };

  function scanDirectional(pt: Types.Point2, { dx, dy }): Types.Point2 {
    const mag = Math.hypot(dx, dy);
    const ux = dx / mag;
    const uy = dy / mag;

    let bestX = pt[0];
    let bestY = pt[1];
    let bestVal = edgeBuf[Math.round(pt[1]) * width + Math.round(pt[0])];

    for (let t = 0; t <= maxDist; t += step) {
      const x = pt[0] + t * ux;
      const y = pt[1] + t * uy;
      const xi = Math.round(x),
        yi = Math.round(y);
      if (xi < 0 || xi >= width || yi < 0 || yi >= height) {
        break;
      }
      const v = edgeBuf[yi * width + xi];
      if (v > bestVal) {
        bestX = x;
        bestY = y;
        bestVal = v;
      }
    }

    return [bestX, bestY];
  }

  return {
    P1: scanDirectional(rough.P1, directions.P1),
    P2: scanDirectional(rough.P2, directions.P2),
    P3: scanDirectional(rough.P3, directions.P3),
    P4: scanDirectional(rough.P4, directions.P4),
  };
}

/**
 * Main function to calculate fan shape corners from an image buffer and convex hull
 *
 * This function orchestrates the complete corner detection process:
 * 1. Computes edge magnitudes using Sobel operator
 * 2. Identifies rough corner points from the convex hull
 * 3. Refines corner positions by scanning for strong edges
 *
 * @param {Uint8Array|Uint8ClampedArray|Array<number>} imageBuffer - Image data buffer
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {Array<Types.Point2>} hull - Convex hull points from previous processing
 * @returns {FanShapeCorners} The four refined corner points that define the fan shape
 */
export function calculateFanShapeCorners(
  imageBuffer,
  width,
  height,
  hull: Array<Types.Point2>
): FanShapeCorners {
  // 1) From your original image buffer:
  const edgeBuf = computeEdgeBuffer(imageBuffer, width, height);

  // 2) Get rough points:
  const rough = pickPoints(hull, 5);

  // 3) Refine using directional scan:
  const refined = refineCornersDirectional(edgeBuf, width, height, rough, {
    maxDist: 20,
    step: 0.5,
  });
  return refined;
}
