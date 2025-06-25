import type { Types } from '@cornerstonejs/core';
import * as math from '../math';
import {
  checkIntersection,
  convertContourPolylineToCanvasSpace,
} from './sharedOperations';
import arePolylinesIdentical from '../math/polyline/arePolylinesIdentical';

/**
 * Unifies two sets of polylines by merging intersecting polylines and keeping non-intersecting ones.
 * If a polyline from set A intersects with a polyline from set B, they are merged.
 * If no intersection is found, the polylines are added as-is to the result.
 */
export function unifyPolylineSets(
  polylinesSetA: Types.Point2[][],
  polylinesSetB: Types.Point2[][]
): Types.Point2[][] {
  const result: Types.Point2[][] = [];
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
      if (arePolylinesIdentical(polylineA, polylineB)) {
        result.push([...polylineA]);
        processedFromA.add(i);
        processedFromB.add(j);
        merged = true;
        break;
      }
      const intersection = checkIntersection(polylineA, polylineB);
      if (intersection.hasIntersection && !intersection.isContourHole) {
        const mergedPolyline = math.polyline.mergePolylines(
          polylineA,
          polylineB
        );
        result.push(mergedPolyline);
        processedFromA.add(i);
        processedFromB.add(j);
        merged = true;
        break;
      }
    }
    if (!merged) {
      result.push([...polylineA]);
      processedFromA.add(i);
    }
  }
  for (let j = 0; j < polylinesSetB.length; j++) {
    if (!processedFromB.has(j)) {
      result.push([...polylinesSetB[j]]);
    }
  }
  return result;
}

/**
 * Unifies multiple sets of polylines by progressively merging them.
 */
export function unifyMultiplePolylineSets(
  polylineSets: Types.Point2[][][]
): Types.Point2[][] {
  if (polylineSets.length === 0) {
    return [];
  }
  if (polylineSets.length === 1) {
    return polylineSets[0].map((polyline) => [...polyline]);
  }
  let result = polylineSets[0].map((polyline) => [...polyline]);
  for (let i = 1; i < polylineSets.length; i++) {
    result = unifyPolylineSets(result, polylineSets[i]);
  }
  return result;
}

/**
 * Unifies polylines from annotations by extracting their polylines and merging intersecting ones.
 */
export function unifyAnnotationPolylines(
  annotationsSetA: Array<{ data: { contour: { polyline: Types.Point3[] } } }>,
  annotationsSetB: Array<{ data: { contour: { polyline: Types.Point3[] } } }>,
  viewport: Types.IViewport
): Types.Point2[][] {
  const polylinesSetA = annotationsSetA.map((annotation) =>
    convertContourPolylineToCanvasSpace(
      annotation.data.contour.polyline,
      viewport
    )
  );
  const polylinesSetB = annotationsSetB.map((annotation) =>
    convertContourPolylineToCanvasSpace(
      annotation.data.contour.polyline,
      viewport
    )
  );
  return unifyPolylineSets(polylinesSetA, polylinesSetB);
}
