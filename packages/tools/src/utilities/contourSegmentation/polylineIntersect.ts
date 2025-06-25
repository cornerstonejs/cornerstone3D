import type { Types } from '@cornerstonejs/core';
import { checkIntersection, cleanupPolylines } from './sharedOperations';
import { intersectPolylines } from '../math/polyline';
import arePolylinesIdentical from '../math/polyline/arePolylinesIdentical';

/**
 * Performs the intersection operation on two sets of polylines.
 * This function returns the polylines that represent the overlapping areas between the two sets.
 * Uses a direct approach to find intersecting regions.
 */
export function intersectPolylinesSets(
  polylinesSetA: Types.Point2[][],
  polylinesSetB: Types.Point2[][]
): Types.Point2[][] {
  if (!polylinesSetA.length || !polylinesSetB.length) {
    return [];
  }
  const result: Types.Point2[][] = [];
  for (const polylineA of polylinesSetA) {
    for (const polylineB of polylinesSetB) {
      if (arePolylinesIdentical(polylineA, polylineB)) {
        result.push([...polylineA]);
        continue;
      }
      const intersection = checkIntersection(polylineA, polylineB);
      if (intersection.hasIntersection && !intersection.isContourHole) {
        const intersectionRegions = intersectPolylines(polylineA, polylineB);
        if (intersectionRegions && intersectionRegions.length > 0) {
          result.push(...intersectionRegions);
        }
      }
    }
  }
  return cleanupPolylines(result);
}
