import type { Types } from '@cornerstonejs/core';

/**
 * Calculates the perimeter of a polyline.
 *
 * @param polyline - The polyline represented as an array of points.
 * @param closed - Indicates whether the polyline is closed or not.
 * @returns The perimeter of the polyline.
 */
function calculatePerimeter(polyline: number[][], closed: boolean): number {
  let perimeter = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const point1 = polyline[i] as Types.Point3;
    const point2 = polyline[i + 1] as Types.Point3;

    perimeter += _calculatePerimeter(point1, point2);
  }

  if (closed) {
    const firstPoint = polyline[0] as Types.Point3;
    const lastPoint = polyline[polyline.length - 1] as Types.Point3;
    perimeter += _calculatePerimeter(firstPoint, lastPoint);
  }

  return perimeter;
}

function _calculatePerimeter(
  point1: Types.Point3,
  point2: Types.Point3
): number {
  const dx = point1[0] - point2[0];
  const dy = point1[1] - point2[1];
  const dz = point1[2] - point2[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export default calculatePerimeter;
