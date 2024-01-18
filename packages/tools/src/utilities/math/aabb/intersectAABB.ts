import { Types } from '@cornerstonejs/core';

export default function intersectAABB(
  aabb1: Types.AABB2,
  aabb2: Types.AABB2
): boolean {
  return (
    aabb1.minX <= aabb2.maxX &&
    aabb1.maxX >= aabb2.minX &&
    aabb1.minY <= aabb2.maxY &&
    aabb1.maxY >= aabb2.minY
  );
}
