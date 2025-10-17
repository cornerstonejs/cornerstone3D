import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

/**
 * Calculates the perimeter of a polyline.
 *
 * @param polyline - The polyline represented as an array of points.
 * @param closed - Indicates whether the polyline is closed or not.
 * @returns The perimeter of the polyline.
 */
export function calculatePerimeter(
  polyline: number[][],
  closed: boolean
): number {
  let perimeter = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const point1 = polyline[i] as Types.Point3;
    const point2 = polyline[i + 1] as Types.Point3;

    perimeter += vec3.dist(point1, point2);
  }

  if (closed) {
    const firstPoint = polyline[0] as Types.Point3;
    const lastPoint = polyline[polyline.length - 1] as Types.Point3;
    perimeter += vec3.dist(firstPoint, lastPoint);
  }

  return perimeter;
}

export default calculatePerimeter;
