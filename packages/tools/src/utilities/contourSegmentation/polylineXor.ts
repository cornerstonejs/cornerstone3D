import type { Types } from '@cornerstonejs/core';
import { cleanupPolylines } from './sharedOperations';
import arePolylinesIdentical from '../math/polyline/arePolylinesIdentical';
import { subtractPolylineSets } from './polylineSubtract';

/**
 * Performs the XOR (exclusive or) operation on two sets of polylines.
 * This function returns the polylines that represent the areas that are in one set
 * but not in both sets (subtraction of the intersection from the union).
 */
export function xorPolylinesSets(
  polylinesSetA: Types.Point2[][],
  polylinesSetB: Types.Point2[][]
): Types.Point2[][] {
  if (!polylinesSetA.length && !polylinesSetB.length) {
    return [];
  }
  if (!polylinesSetA.length) {
    return polylinesSetB.map((polyline) => [...polyline]);
  }
  if (!polylinesSetB.length) {
    return polylinesSetA.map((polyline) => [...polyline]);
  }
  if (polylinesSetA.length === polylinesSetB.length) {
    let allIdentical = true;
    for (let i = 0; i < polylinesSetA.length; i++) {
      let foundMatch = false;
      for (let j = 0; j < polylinesSetB.length; j++) {
        if (arePolylinesIdentical(polylinesSetA[i], polylinesSetB[j])) {
          foundMatch = true;
          break;
        }
      }
      if (!foundMatch) {
        allIdentical = false;
        break;
      }
    }
    if (allIdentical) {
      return [];
    }
  }
  const aMinusB = subtractPolylineSets(polylinesSetA, polylinesSetB);
  const bMinusA = subtractPolylineSets(polylinesSetB, polylinesSetA);
  const xorResult = [...aMinusB, ...bMinusA];
  return cleanupPolylines(xorResult);
}
