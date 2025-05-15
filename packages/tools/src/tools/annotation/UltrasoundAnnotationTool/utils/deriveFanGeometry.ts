import type { Types } from '@cornerstonejs/core';
import type { FanGeometry, FanShapeCorners } from './types';

/**
 * Compute intersection of two infinite lines (p1→p2) and (p3→p4).
 * Returns a point or null if parallel.
 *
 * @param {Types.Point2} p1 - First point of first line
 * @param {Types.Point2} p2 - Second point of first line
 * @param {Types.Point2} p3 - First point of second line
 * @param {Types.Point2} p4 - Second point of second line
 * @returns {Types.Point2|null} Intersection point or null if lines are parallel
 */
function intersect(
  p1: Types.Point2,
  p2: Types.Point2,
  p3: Types.Point2,
  p4: Types.Point2
): Types.Point2 | null {
  const rx = p2[0] - p1[0];
  const ry = p2[1] - p1[1];
  const sx = p4[0] - p3[0];
  const sy = p4[1] - p3[1];
  const denom = rx * sy - ry * sx;
  if (denom === 0) {
    return null;
  } // parallel
  const qpx = p3[0] - p1[0];
  const qpy = p3[1] - p1[1];
  const t = (qpx * sy - qpy * sx) / denom;
  return [p1[0] + t * rx, p1[1] + t * ry];
}

/**
 * Calculate angle in radians from center to point p
 *
 * @param {Types.Point2} center - Center point
 * @param {Types.Point2} p - Target point
 * @returns {number} Angle in radians
 */
function angleRad(center: Types.Point2, p: Types.Point2): number {
  return Math.atan2(p[1] - center[1], p[0] - center[0]);
}

/**
 * Derives fan geometry parameters from four corner points
 *
 * Takes four corner points that define a fan shape and calculates the
 * geometric parameters that fully describe the fan:
 * - center (apex point)
 * - angular range (startAngle, endAngle)
 * - radial range (innerRadius, outerRadius)
 *
 * The expected corner points are:
 * - P1: inner-left (top arc, leftmost)
 * - P2: outer-left (full-hull leftmost)
 * - P3: outer-right (full-hull rightmost)
 * - P4: inner-right (top arc, rightmost)
 *
 * @param {FanShapeCorners} params - Object containing the four corner points
 * @returns {FanGeometry} Fan geometry parameters {center, startAngle, endAngle, innerRadius, outerRadius}
 * @throws {Error} If fan edges are parallel (no apex can be found)
 */
export function deriveFanGeometry(params: FanShapeCorners): FanGeometry {
  const { P1, P2, P3, P4 } = params;

  // --- 1) Apex (intersection of P1→P2 and P4→P3)
  const center = intersect(P1, P2, P4, P3);
  if (!center) {
    throw new Error('Fan edges appear parallel — no apex found');
  }

  // --- 2) Angle range (ensure end > start, handle wrap-around)
  let startAngle = angleRad(center, P1);
  let endAngle = angleRad(center, P4);
  if (endAngle <= startAngle) {
    const tempAngle = startAngle;
    startAngle = endAngle;
    endAngle = tempAngle;
  }

  // --- 3) Geometric bounds for inner/outer radius
  const d1 = Math.hypot(P1[0] - center[0], P1[1] - center[1]);
  const d4 = Math.hypot(P4[0] - center[0], P4[1] - center[1]);
  const d2 = Math.hypot(P2[0] - center[0], P2[1] - center[1]);
  const d3 = Math.hypot(P3[0] - center[0], P3[1] - center[1]);
  const innerRadius = Math.min(d1, d4);
  const outerRadius = Math.max(d2, d3);

  return {
    center,
    startAngle,
    endAngle,
    innerRadius,
    outerRadius,
  };
}
