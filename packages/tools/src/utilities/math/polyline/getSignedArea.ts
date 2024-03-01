import type { Types } from '@cornerstonejs/core';

/**
 * Returns the area with signal of a 2D polyline
 * https://www.youtube.com/watch?v=GpsKrAipXm8&t=1900s
 *
 * This functions has a runtime very close to `getArea` and it is recommended to
 * be called only if you need the area signal (eg: calculate polygon normal). If
 * you do not need the area signal you should always call `getArea`.
 *
 *
 * @param polyline - Polyline points (2D)
 * @returns Area of the polyline (with signal)
 */
export default function getSignedArea(polyline: Types.Point2[]): number {
  if (polyline.length < 3) {
    return 0;
  }

  // Reference point can be any point on the same plane
  const refPoint = polyline[0];
  let area = 0;

  // Takes three points (reference point and two other points from each line
  // segment) and calculate the area with cross product. The magnitude of the
  // vector returned by a cross product is equal to the area of the parallelogram
  // that the vectors span which is two times the area of the triangle.
  //
  // Not calling vec3 mathods makes the function run much faster since polylines
  // may have thousands of points when using freehand ROI tool and that would
  // increase considerably the number of function calls.
  for (let i = 0, len = polyline.length; i < len; i++) {
    const p1 = polyline[i];
    // Using ternary instead of % (mod) operator to make it faster
    const p2Index = i === len - 1 ? 0 : i + 1;
    const p2 = polyline[p2Index];
    const aX = p1[0] - refPoint[0];
    const aY = p1[1] - refPoint[1];
    const bX = p2[0] - refPoint[0];
    const bY = p2[1] - refPoint[1];

    // Cross product between vectors "a" and "b" which returns (0, 0, crossProd)
    // for 2D vectors.
    area += aX * bY - aY * bX;
  }

  // Divide by two because cross product returns two times the area for each triangle
  area *= 0.5;

  return area;
}
