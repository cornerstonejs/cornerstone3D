import type { Types } from '@cornerstonejs/core';
import * as mathLine from '../line';

const EPSILON = 0.1;
const EPSILON_SQUARED = EPSILON * EPSILON;

/**
 * Ramer–Douglas–Peucker algorithm implementation to decimate a polyline
 * to a similar polyline with fewer points
 *
 * https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
 * https://rosettacode.org/wiki/Ramer-Douglas-Peucker_line_simplification
 * https://karthaus.nl/rdp/
 *
 * @param polyline - Polyline to simplify
 * @returns Simplified polyline
 */
export default function simplify(polyline: Types.Point2[]) {
  const numPoints = polyline.length;

  // There are no points in a triangle that can be removed
  if (numPoints < 3) {
    return polyline;
  }

  const polylinePointFlags = new Array(numPoints).fill(false);
  const partitionQueue = [[0, numPoints - 1]];

  // Start and end points are always added to the simplified polyline
  let numSimplifiedPoints = 2;

  // Add start and end points to the simplified polyline
  polylinePointFlags[0] = true;
  polylinePointFlags[numPoints - 1] = true;

  // Using a loop+queue instead of recursion to avoid up to numPoints*2 function calls
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
    if (maxDistSquared < EPSILON_SQUARED) {
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

  // Use a pre-allocated array is much faster then multiple push() calls
  const simplifiedPolyline: Types.Point2[] = new Array(numSimplifiedPoints);

  for (let srcIndex = 0, dstIndex = 0; srcIndex < numPoints; srcIndex++) {
    if (polylinePointFlags[srcIndex]) {
      simplifiedPolyline[dstIndex++] = polyline[srcIndex];
    }
  }

  return simplifiedPolyline;
}
