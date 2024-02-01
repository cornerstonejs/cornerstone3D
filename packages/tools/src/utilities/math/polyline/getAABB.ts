import { Types } from '@cornerstonejs/core';

export default function getAABB(polyline: Types.Point2[]): Types.AABB2 {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0, len = polyline.length; i < len; i++) {
    const [x, y] = polyline[i];

    // No Math.min/max calls for better performance
    minX = minX < x ? minX : x;
    minY = minY < y ? minY : y;
    maxX = maxX > x ? maxX : x;
    maxY = maxY > y ? maxY : y;
  }

  return { minX, maxX, minY, maxY };
}
