import { Types } from '@cornerstonejs/core';

/**
 * Line segment the is part of a curve segment based on its resolution.
 * Each curve segment shall have 20 line segments when spline resolution
 * is set to 20.
 */
export type SplineLineSegment = {
  /** Start and end points for the line segment */
  points: {
    start: Types.Point2;
    end: Types.Point2;
  };
  /** Axis-aligned bounding (minX, minY, maxX, maxY) */
  aabb: Types.AABB2;
  /** Length of the line segment */
  length: number;
  /** Total length of all previous line segments for a given curve segment */
  previousLineSegmentsLength: number;
};
