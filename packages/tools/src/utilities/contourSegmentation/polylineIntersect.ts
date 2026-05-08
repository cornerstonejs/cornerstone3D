import type { PolylineInfoCanvas } from './polylineInfoTypes';
import { checkIntersection, cleanupPolylines } from './sharedOperations';
import { intersectPolylines } from '../math/polyline';
import arePolylinesIdentical from '../math/polyline/arePolylinesIdentical';
import { areViewReferencesEqual } from './areViewReferencesEqual';

/**
 * Performs the intersection operation on two sets of polylines.
 * Returns polylines that are present in both sets (by polyline and viewReference),
 * or the intersected regions if the polylines overlap.
 *
 * @param set1 The first set of PolylineInfoCanvas
 * @param set2 The second set of PolylineInfoCanvas
 * @returns Array of PolylineInfoCanvas representing the intersection
 */
export function intersectPolylinesSets(
  set1: PolylineInfoCanvas[],
  set2: PolylineInfoCanvas[]
): PolylineInfoCanvas[] {
  if (!set1.length || !set2.length) {
    return [];
  }
  const result: PolylineInfoCanvas[] = [];
  for (const polyA of set1) {
    for (const polyB of set2) {
      if (!areViewReferencesEqual(polyA.viewReference, polyB.viewReference)) {
        continue; // Skip if view references are not equal
      }
      if (arePolylinesIdentical(polyA.polyline, polyB.polyline)) {
        result.push({ ...polyA });
        continue;
      }
      const intersection = checkIntersection(polyA.polyline, polyB.polyline);
      if (intersection.hasIntersection && !intersection.isContourHole) {
        const intersectionRegions = cleanupPolylines(
          intersectPolylines(polyA.polyline, polyB.polyline)
        );
        if (intersectionRegions && intersectionRegions.length > 0) {
          intersectionRegions.forEach((region) => {
            result.push({
              polyline: region,
              viewReference: polyA.viewReference,
            });
          });
        }
      }
    }
  }
  return result;
}
