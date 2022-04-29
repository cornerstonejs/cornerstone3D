import { vec2 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';

/**
 * Returns true if points `p1` and `p2` are within `closeContourProximity`.
 */
const pointsAreWithinCloseContourProximity = (
  p1: Types.Point2,
  p2: Types.Point2,
  closeContourProximity: number
): boolean => {
  return vec2.dist(p1, p2) < closeContourProximity;
};

export default pointsAreWithinCloseContourProximity;
