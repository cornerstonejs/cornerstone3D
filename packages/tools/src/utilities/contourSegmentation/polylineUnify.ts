import type { Types } from '@cornerstonejs/core';
import * as math from '../math';
import {
  checkIntersection,
  convertContourPolylineToCanvasSpace,
} from './sharedOperations';
import arePolylinesIdentical from '../math/polyline/arePolylinesIdentical';
import type { PolylineInfoCanvas } from './polylineInfoTypes';
import type { ContourSegmentationAnnotation } from '../../types';
import { getViewReferenceFromAnnotation } from './getViewReferenceFromAnnotation';
import { areViewReferencesEqual } from './areViewReferencesEqual';

/**
 * Unifies two sets of polylines by merging unique polylines from both sets.
 * If a polyline from set B is not present in set A (by polyline and viewReference),
 * it is added to the result. The result contains all unique polylines from both sets.
 *
 * @param polylinesSetA The first set of PolylineInfoCanvas
 * @param polylinesSetB The second set of PolylineInfoCanvas
 * @returns Array of unique PolylineInfoCanvas from both sets
 */
export function unifyPolylineSets(
  polylinesSetA: PolylineInfoCanvas[],
  polylinesSetB: PolylineInfoCanvas[]
): PolylineInfoCanvas[] {
  const result: PolylineInfoCanvas[] = [];
  const processedFromA = new Set<number>();
  const processedFromB = new Set<number>();
  for (let i = 0; i < polylinesSetA.length; i++) {
    if (processedFromA.has(i)) {
      continue;
    }
    const polylineA = polylinesSetA[i];
    let merged = false;
    for (let j = 0; j < polylinesSetB.length; j++) {
      if (processedFromB.has(j)) {
        continue;
      }
      const polylineB = polylinesSetB[j];
      if (
        !areViewReferencesEqual(
          polylineA.viewReference,
          polylineB.viewReference
        )
      ) {
        continue; // Skip if view references are not equal
      }
      if (arePolylinesIdentical(polylineA.polyline, polylineB.polyline)) {
        result.push(polylineA);
        processedFromA.add(i);
        processedFromB.add(j);
        merged = true;
        break;
      }
      const intersection = checkIntersection(
        polylineA.polyline,
        polylineB.polyline
      );
      if (intersection.hasIntersection && !intersection.isContourHole) {
        const mergedPolyline = math.polyline.mergePolylines(
          polylineA.polyline,
          polylineB.polyline
        );
        result.push({
          polyline: mergedPolyline,
          viewReference: polylineA.viewReference,
        });
        processedFromA.add(i);
        processedFromB.add(j);
        merged = true;
        break;
      }
    }
    if (!merged) {
      result.push(polylineA);
      processedFromA.add(i);
    }
  }
  for (let j = 0; j < polylinesSetB.length; j++) {
    if (!processedFromB.has(j)) {
      result.push(polylinesSetB[j]);
    }
  }
  return result;
}

/**
 * Unifies multiple sets of polylines by progressively merging them.
 */
export function unifyMultiplePolylineSets(
  polylineSets: PolylineInfoCanvas[][]
): PolylineInfoCanvas[] {
  if (polylineSets.length === 0) {
    return [];
  }
  if (polylineSets.length === 1) {
    return [...polylineSets[0]];
  }
  let result = [...polylineSets[0]];
  for (let i = 1; i < polylineSets.length; i++) {
    result = unifyPolylineSets(result, polylineSets[i]);
  }
  return result;
}

/**
 * Unifies polylines from annotations by extracting their polylines and merging intersecting ones.
 */
export function unifyAnnotationPolylines(
  annotationsSetA: ContourSegmentationAnnotation[],
  annotationsSetB: ContourSegmentationAnnotation[],
  viewport: Types.IViewport
): PolylineInfoCanvas[] {
  const polylinesSetA = annotationsSetA.map((annotation) => ({
    polyline: convertContourPolylineToCanvasSpace(
      annotation.data.contour.polyline,
      viewport
    ),
    viewReference: getViewReferenceFromAnnotation(annotation),
  }));
  const polylinesSetB = annotationsSetB.map((annotation) => ({
    polyline: convertContourPolylineToCanvasSpace(
      annotation.data.contour.polyline,
      viewport
    ),
    viewReference: getViewReferenceFromAnnotation(annotation),
  }));
  return unifyPolylineSets(polylinesSetA, polylinesSetB);
}
