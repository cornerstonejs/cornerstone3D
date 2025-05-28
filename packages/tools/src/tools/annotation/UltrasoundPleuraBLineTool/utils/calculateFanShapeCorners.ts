import type { Types } from '@cornerstonejs/core';
import type { FanShapeCorners, RefinementOptions } from './types';

/**
 * Pick the four fan-corner points
 *
 *   P1 = inner-left   (top arc, leftmost)
 *   P4 = inner-right  (top arc, rightmost)
 *   P2 = outer-left   (global leftmost)
 *   P3 = outer-right  (global rightmost)
 *
 * The algorithm:
 *   1.  P2/P3 = min-x / max-x on the hull.
 *   2.  Walk from P2→P3 in both circular directions; the one that
 *       contains the global y-minimum is the upper chain.
 *   3.  Inside that chain, find the local y-minimum (the top arc)
 *       and keep every point within ±slack px of it.
 *   4.  P1 = leftmost of that set, P4 = rightmost of that set.
 *
 * @param  hull   Convex-hull points **in order**
 * @param  slack  Vertical tolerance (px) around the top arc.  Default 7.
 */
export function pickPoints(
  hull: Array<Types.Point2>,
  slack = 7
): FanShapeCorners {
  if (!hull.length) {
    throw new Error('Convex hull is empty');
  }
  const n = hull.length;

  /* ---------- helpers ---------- */
  const next = (i: number) => (i + 1) % n;
  const walk = (from: number, to: number) => {
    const idx: number[] = [];
    for (let i = from; ; i = next(i)) {
      idx.push(i);
      if (i === to) {
        break;
      }
    }
    return idx;
  };

  /* ---------- step-1 : extremes ---------- */
  let i2 = 0,
    i3 = 0;
  for (let i = 1; i < n; i++) {
    if (hull[i][0] < hull[i2][0]) {
      i2 = i;
    } // global min-x
    if (hull[i][0] > hull[i3][0]) {
      i3 = i;
    } // global max-x
  }
  const P2 = hull[i2];
  const P3 = hull[i3];

  /* ---------- step-2 : which direction is the top arc? ---------- */
  const pathA = walk(i2, i3); // P2 → P3 (forwards)
  const pathB = walk(i3, i2); // P3 → P2 (wrap-around)
  const globalYmin = Math.min(...hull.map((p) => p[1]));
  const upperPath = pathA.some((i) => hull[i][1] === globalYmin)
    ? pathA
    : pathB;

  /* ---------- step-3 : collect very top points ---------- */
  const topY = Math.min(...upperPath.map((i) => hull[i][1]));
  let arcPts = upperPath
    .map((i) => hull[i])
    .filter((p) => Math.abs(p[1] - topY) <= slack);

  // fall-back: if tolerance was too tight, take the two highest points
  if (arcPts.length < 2) {
    arcPts = upperPath
      .map((i) => hull[i])
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2);
  }

  /* ---------- step-4 : choose P1 / P4 inside that arc ---------- */
  const P1 = arcPts.reduce((best, p) => (p[0] < best[0] ? p : best), arcPts[0]);
  const P4 = arcPts.reduce((best, p) => (p[0] > best[0] ? p : best), arcPts[0]);

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
 * Snap each rough corner to the strongest-edge vertex that falls
 * inside its **quadrant box** rather than along a single ray.
 *
 * quadrant box for a corner Pi with preferred direction (dx,dy):
 *   x-range:  Pi.x - maxDist .. Pi.x + slack     (dx < 0)
 *             Pi.x - slack   .. Pi.x + maxDist   (dx > 0)
 *   y-range:  Pi.y - maxDist .. Pi.y + slack     (dy < 0)
 *             Pi.y - slack   .. Pi.y + maxDist   (dy > 0)
 *
 * @param edgeBuf    edge magnitude buffer, length = width*height
 * @param width      image width
 * @param height     image height
 * @param rough      rough {P1,P2,P3,P4}
 * @param contour    array of [x,y] vertices making up the contour
 * @param opts.maxDist  reach along the preferred direction   (default 15)
 * @param opts.slack    tolerance perpendicular to the direction (default 2)
 */
export function refineCornersDirectional(
  edgeBuf: Float32Array,
  width: number,
  height: number,
  rough: FanShapeCorners,
  contour: Array<Types.Point2>,
  opts: RefinementOptions & { slack?: number } = {}
): FanShapeCorners {
  const { maxDist = 15, slack = 2 } = opts;

  /* preferred directions (unchanged) */
  const directions = {
    P1: { dx: -1, dy: -1 },
    P2: { dx: -1, dy: +1 },
    P3: { dx: +1, dy: +1 },
    P4: { dx: +1, dy: -1 },
  };

  /** choose the best contour vertex inside the quadrant box */
  function snapQuadrant(
    pt: Types.Point2,
    { dx, dy }: { dx: number; dy: number },
    threshold = 5
  ): Types.Point2 {
    /* build bounding box for the quadrant */
    const xmin = dx < 0 ? pt[0] - maxDist : pt[0] - slack;
    const xmax = dx < 0 ? pt[0] + slack : pt[0] + maxDist;
    const ymin = dy < 0 ? pt[1] - maxDist : pt[1] - slack;
    const ymax = dy < 0 ? pt[1] + slack : pt[1] + maxDist;

    let best: Types.Point2 = pt;

    for (const [cx, cy] of contour) {
      if (cx < xmin || cx > xmax || cy < ymin || cy > ymax) {
        continue;
      }

      const xi = Math.round(cx);
      const yi = Math.round(cy);
      if (xi < 0 || xi >= width || yi < 0 || yi >= height) {
        continue;
      }

      const xAlign = (xi - best[0]) * dx;
      const yAlign = (yi - best[0]) * dy;
      const v = edgeBuf[yi * width + xi];
      if (v > threshold && (xAlign > 0 || yAlign > 0)) {
        best = [cx, cy];
      }
    }

    return best;
  }

  /* apply to the four corners */
  return {
    P1: snapQuadrant(rough.P1, directions.P1),
    P2: snapQuadrant(rough.P2, directions.P2),
    P3: snapQuadrant(rough.P3, directions.P3),
    P4: snapQuadrant(rough.P4, directions.P4),
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
 * @param {Array<Types.Point2>} roughContour - rough contour of the US image
 * @returns {FanShapeCorners} The four refined corner points that define the fan shape
 */
export function calculateFanShapeCorners(
  imageBuffer,
  width,
  height,
  hull: Array<Types.Point2>,
  roughContour: Array<Types.Point2>
): FanShapeCorners {
  // 1) Get rough points:
  const rough = pickPoints(hull);

  // 2) Refine using directional scan:
  const refined = refineCornersDirectional(
    imageBuffer,
    width,
    height,
    rough,
    roughContour,
    {
      maxDist: 20,
      step: 0.5,
    }
  );
  return refined;
}
