import { Types } from '@cornerstonejs/core';
import distanceToPointSquared from './distanceToPointSquared';

export default function distanceToPoint(
  aabb: Types.AABB2,
  point: Types.Point2
): number {
  return Math.sqrt(distanceToPointSquared(aabb, point));
}
