import type { Types } from '@cornerstonejs/core';
import { getAllIntersectionsWithPolyline } from './getIntersectionWithPolyline';

export default function pointInPolyline(
  points: Types.Point2[],
  point: Types.Point2,
  pointEnd: Types.Point2
): boolean {
  const intersections = getAllIntersectionsWithPolyline(points, point, [
    point[0],
    pointEnd[1],
  ]);

  if (intersections.length % 2 === 0) {
    return false;
  }

  return true;
}
