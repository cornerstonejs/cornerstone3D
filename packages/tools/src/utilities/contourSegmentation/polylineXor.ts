import type { Types } from '@cornerstonejs/core';
import { cleanupPolylines } from './sharedOperations';
import arePolylinesIdentical from '../math/polyline/arePolylinesIdentical';
import { subtractPolylineSets } from './polylineSubtract';
import type { PolylineInfoCanvas } from './polylineInfoTypes';
import { areViewReferencesEqual } from './areViewReferencesEqual';

/**
 * Performs the XOR (exclusive or) operation on two sets of polylines.
 * Returns polylines that are in one set or the other, but not both (by polyline and viewReference).
 * If both sets are identical, returns an empty array.
 *
 * @param polylinesSetA The first set of PolylineInfoCanvas
 * @param polylinesSetB The second set of PolylineInfoCanvas
 * @returns Array of PolylineInfoCanvas that are unique to each set
 */
export function xorPolylinesSets(
  polylinesSetA: PolylineInfoCanvas[],
  polylinesSetB: PolylineInfoCanvas[]
): PolylineInfoCanvas[] {
  if (!polylinesSetA.length && !polylinesSetB.length) {
    return [];
  }
  if (!polylinesSetA.length) {
    return polylinesSetB;
  }
  if (!polylinesSetB.length) {
    return polylinesSetA;
  }
  if (polylinesSetA.length === polylinesSetB.length) {
    let allIdentical = true;
    for (let i = 0; i < polylinesSetA.length; i++) {
      let foundMatch = false;
      for (let j = 0; j < polylinesSetB.length; j++) {
        if (
          !areViewReferencesEqual(
            polylinesSetA[i].viewReference,
            polylinesSetB[j].viewReference
          )
        ) {
          continue; // Skip if view references are not equal
        }
        if (
          arePolylinesIdentical(
            polylinesSetA[i].polyline,
            polylinesSetB[j].polyline
          )
        ) {
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
  return xorResult;
}
