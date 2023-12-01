import { Types } from '@cornerstonejs/core';
import type { SplineLineSegment } from './SplineLineSegment';

/**
 * Spline curve segment the is part of a spline path
 */
export type SplineCurveSegment = {
  /**
   * Control Points that influences the spline curve segment.
   *
   * For cubic splines the curve goes from P1 and P2 but it is also influenced by the
   * previous point (P0) and the next point (P3)
   */
  controlPoints: {
    p0: Types.Point2;
    p1: Types.Point2;
    p2: Types.Point2;
    p3: Types.Point2;
  };
  /** Axis-aligned bounding (minX, minY, maxX, maxY) */
  aabb: Types.AABB2;
  /** Length of the curve segment */
  length: number;
  /** Total length of all previous curve segments */
  previousCurveSegmentsLength: number;
  /** Line segments that makes the curve segment */
  lineSegments: SplineLineSegment[];
};
