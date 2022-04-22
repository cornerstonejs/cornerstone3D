import { vec2 } from 'gl-matrix';

const pointCanProjectOnLine = (p, p1, p2, proximity) => {
  // Perfom checks in order of computational complexity.
  const p1p = [p[0] - p1[0], p[1] - p1[1]]; // { x: p.x - p1.x, y: p.y - p1.y };
  const p1p2 = [p2[0] - p1[0], p2[1] - p1[1]]; //{ x: p2.x - p1.x, y: p2.y - p1.y };

  const dot = p1p[0] * p1p2[0] + p1p[1] * p1p2[1];

  // const dot = p1p.x * p1p2.x + p1p.y * p1p2.y;

  // Dot product needs to be positive to be a candidate for projection onto line segment.
  if (dot < 0) {
    return false;
  }

  const p1p2Mag = Math.sqrt(p1p2[0] * p1p2[0] + p1p2[1] * p1p2[1]);
  const projectionVectorMag = dot / p1p2Mag;
  const p1p2UnitVector = [p1p2[0] / p1p2Mag, p1p2[1] / p1p2Mag];
  const projectionVector = [
    p1p2UnitVector[0] * projectionVectorMag,
    p1p2UnitVector[1] * projectionVectorMag,
  ];
  const projectionPoint = <Type.Point2>[
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

  return distance;
};

export default pointCanProjectOnLine;
