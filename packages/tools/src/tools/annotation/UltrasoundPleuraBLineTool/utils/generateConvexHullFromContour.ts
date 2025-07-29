import type { Types } from '@cornerstonejs/core';
import * as math from '../../../../utilities/math';

/**
 * Generate a convex hull from a contour by simplifying, smoothing, and computing the hull
 *
 * This function orchestrates the complete convex hull generation process:
 * 1. Simplifies the contour to remove unnecessary detail
 * 2. Computes the convex hull of the simplified contour
 *
 * @param {Array<Types.Point2>} contour - Array of points representing the input contour
 */
export function generateConvexHullFromContour(contour: Array<Types.Point2>) {
  // 1) Simplify jagged bits (ε = e.g. 2px):
  const simplified = math.polyline.decimate(contour, 2);

  // calculate convex hull
  const hull = math.polyline.convexHull(simplified);
  return { simplified, hull };
}
