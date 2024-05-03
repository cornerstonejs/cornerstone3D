import type { Types } from '@cornerstonejs/core';
import isClosed from './isClosed';

/**
 * Checks if a 2D point is inside the polyline.
 *
 * A point is inside a curve/polygon if the number of intersections between the horizontal
 * ray emanating from the given point and to the right and the line segments is odd.
 * https://www.eecs.umich.edu/courses/eecs380/HANDOUTS/PROJ2/InsidePoly.html
 *
 * Note that a point on the polyline is considered inside.
 *
 * @param polyline - Polyline points (2D)
 * @param point - 2D Point
 * @returns True if the point is inside the polyline or false otherwise
 */
export default function containsPoint(
  polyline: Types.Point2[],
  point: Types.Point2,
  options: {
    closed?: boolean;
    holes?: Types.Point2[][];
  } = {
    closed: undefined,
  }
): boolean {
  if (polyline.length < 3) {
    return false;
  }

  const numPolylinePoints = polyline.length;
  let numIntersections = 0;

  const { closed, holes } = options;

  if (holes?.length) {
    for (const hole of holes) {
      if (containsPoint(hole, point)) {
        return false;
      }
    }
  }

  // Test intersection against [end, start] line segment if it should be closed
  const shouldClose = !(closed === undefined ? isClosed(polyline) : closed);
  const maxSegmentIndex = polyline.length - (shouldClose ? 1 : 2);

  for (let i = 0; i <= maxSegmentIndex; i++) {
    const p1 = polyline[i];

    // Calculating the next point index without using % (mod) operator like in
    // `(i + 1) % numPolylinePoints` to make it 20% faster
    const p2Index = i === numPolylinePoints - 1 ? 0 : i + 1;
    const p2 = polyline[p2Index];

    // Calculating min/max without using Math.min/max to make it ~3% faster
    const maxX = p1[0] >= p2[0] ? p1[0] : p2[0];
    const maxY = p1[1] >= p2[1] ? p1[1] : p2[1];
    const minY = p1[1] <= p2[1] ? p1[1] : p2[1];

    const mayIntersectLineSegment =
      point[0] <= maxX && point[1] >= minY && point[1] < maxY;

    if (mayIntersectLineSegment) {
      const isVerticalLine = p1[0] === p2[0];
      let intersects = isVerticalLine;

      if (!intersects) {
        const xIntersection =
          ((point[1] - p1[1]) * (p2[0] - p1[0])) / (p2[1] - p1[1]) + p1[0];

        intersects = point[0] <= xIntersection;
      }

      numIntersections += intersects ? 1 : 0;
    }
  }

  return !!(numIntersections % 2);
}
