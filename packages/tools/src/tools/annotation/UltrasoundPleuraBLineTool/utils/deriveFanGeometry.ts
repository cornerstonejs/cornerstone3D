import type { Types } from '@cornerstonejs/core';
import type { FanGeometry, FanShapeCorners } from './types';
import { intersectLine } from '../../../../utilities/math/line';

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
  const centerResult = intersectLine(P1, P2, P4, P3, true);
  if (!centerResult) {
    throw new Error('Fan edges appear parallel — no apex found');
  }
  const center = centerResult as Types.Point2;

  // --- 2) Angle range (ensure end > start, handle wrap-around)
  let startAngle = angleRad(center, P1) * (180 / Math.PI);
  let endAngle = angleRad(center, P4) * (180 / Math.PI);
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
