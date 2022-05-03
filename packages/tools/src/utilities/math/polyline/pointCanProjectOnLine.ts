import type { Types } from '@cornerstonejs/core';
import { vec2 } from 'gl-matrix';

/**
 * Returns `true` if the point `p` can project onto point (`p1`, `p2`), and if
 * this projected point is less than `proximity` units away.
 */
const pointCanProjectOnLine = (
  p: Types.Point2,
  p1: Types.Point2,
  p2: Types.Point2,
  proximity: number
): boolean => {
  // Perfom checks in order of computational complexity.
  const p1p = [p[0] - p1[0], p[1] - p1[1]];
  const p1p2 = [p2[0] - p1[0], p2[1] - p1[1]];

  const dot = p1p[0] * p1p2[0] + p1p[1] * p1p2[1];

  // Dot product needs to be positive to be a candidate for projection onto line segment.
  if (dot < 0) {
    return false;
  }

  const p1p2Mag = Math.sqrt(p1p2[0] * p1p2[0] + p1p2[1] * p1p2[1]);

  if (p1p2Mag === 0) {
    return false;
  }

  const projectionVectorMag = dot / p1p2Mag;
  const p1p2UnitVector = [p1p2[0] / p1p2Mag, p1p2[1] / p1p2Mag];
  const projectionVector = [
    p1p2UnitVector[0] * projectionVectorMag,
    p1p2UnitVector[1] * projectionVectorMag,
  ];
  const projectionPoint = <Types.Point2>[
    p1[0] + projectionVector[0],
    p1[1] + projectionVector[1],
  ];

  const distance = vec2.distance(p, projectionPoint);

  if (distance > proximity) {
    // point is too far away.
    return false;
  }

  // Check projects onto line segment.
  if (vec2.distance(p1, projectionPoint) > vec2.distance(p1, p2)) {
    return false;
  }

  return true;
};

export default pointCanProjectOnLine;
