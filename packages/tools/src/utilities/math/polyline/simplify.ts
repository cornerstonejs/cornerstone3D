import type { Types } from '@cornerstonejs/core';
import * as mathLine from '../line';

const DEFAULT_EPSILON = 0.1;

/**
 * Ramer–Douglas–Peucker algorithm implementation to decimate a polyline
 * to a similar polyline with fewer points
 *
 * https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
 * https://rosettacode.org/wiki/Ramer-Douglas-Peucker_line_simplification
 * https://karthaus.nl/rdp/
 *
 * @param polyline - Polyline to simplify
 * @param epsilon - A maximum given distance 'epsilon' to decide if a point
 * should or shouldn't be added the the simplified polyline version. In each
 * iteration the polyline is split into two polylines and the distance of each
 * point from those new polylines are checked against the line that connects
 * the first and last points.
 * @returns Simplified polyline
 */
export default function simplify(
  polyline: Types.Point2[],
  epsilon = DEFAULT_EPSILON
) {
  const numPoints = polyline.length;

  // The polyline must have at least a start and end points
  if (numPoints < 3) {
    return polyline;
  }

  const epsilonSquared = epsilon * epsilon;
  const partitionQueue = [[0, numPoints - 1]];

  // Used a boolean array to set each point that will be in the simplified polyline
  // because pre-allocated arrays are 3-4x faster than thousands of push() calls
  // to add all points to a new array.
  const polylinePointFlags = new Array(numPoints).fill(false);

  // Start and end points are always added to the simplified polyline
  let numSimplifiedPoints = 2;

  // Add start and end points to the simplified polyline
  polylinePointFlags[0] = true;
  polylinePointFlags[numPoints - 1] = true;

  // Iterative approach using a queue instead of recursion to reduce the number
  // of function calls (performance)
  while (partitionQueue.length) {
    const [startIndex, endIndex] = partitionQueue.pop();

    // Return if there is no point between the start and end points
    if (endIndex - startIndex === 1) {
      continue;
    }

    const startPoint = polyline[startIndex];
    const endPoint = polyline[endIndex];
    let maxDistSquared = -Infinity;
    let maxDistIndex = -1;

    // Search for the furthest point
    for (let i = startIndex + 1; i < endIndex; i++) {
      const currentPoint = polyline[i];
      const distSquared = mathLine.distanceToPointSquared(
        startPoint,
        endPoint,
        currentPoint
      );

      if (distSquared > maxDistSquared) {
        maxDistSquared = distSquared;
        maxDistIndex = i;
      }
    }

    // Do not add any of the points because the fursthest one is very close to
    // the line based on the epsilon value
    if (maxDistSquared < epsilonSquared) {
      continue;
    }

    // Update the flag for the furthest point because it will be added to the
    // simplified polyline
    polylinePointFlags[maxDistIndex] = true;
    numSimplifiedPoints++;

    // Partition the points into two parts using maxDistIndex as the pivot point
    // and process both sides
    partitionQueue.push([maxDistIndex, endIndex]);
    partitionQueue.push([startIndex, maxDistIndex]);
  }

  // A pre-allocated array is 3-4x faster then multiple push() calls
  const simplifiedPolyline: Types.Point2[] = new Array(numSimplifiedPoints);

  for (let srcIndex = 0, dstIndex = 0; srcIndex < numPoints; srcIndex++) {
    if (polylinePointFlags[srcIndex]) {
      simplifiedPolyline[dstIndex++] = polyline[srcIndex];
    }
  }

  return simplifiedPolyline;
}
