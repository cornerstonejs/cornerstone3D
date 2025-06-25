import type { Types } from '@cornerstonejs/core';
import * as math from '../math';
import {
  checkIntersection,
  cleanupPolylines,
  convertContourPolylineToCanvasSpace,
  removeDuplicatePoints,
} from './sharedOperations';
import arePolylinesIdentical from '../math/polyline/arePolylinesIdentical';

/**
 * Subtracts intersecting polylines from set A using polylines from set B, keeping non-intersecting ones.
 * If a polyline from set A intersects with a polyline from set B, set B polyline is subtracted from set A.
 * If no intersection is found, the polylines are added as-is to the result.
 */
export function subtractPolylineSets(
  polylinesSetA: Types.Point2[][],
  polylinesSetB: Types.Point2[][]
): Types.Point2[][] {
  const result: Types.Point2[][] = [];
  const processedFromA = new Set<number>();
  for (let i = 0; i < polylinesSetA.length; i++) {
    if (processedFromA.has(i)) {
      continue;
    }
    let currentPolylines = [polylinesSetA[i]];
    let wasSubtracted = false;
    for (let j = 0; j < polylinesSetB.length; j++) {
      const polylineB = polylinesSetB[j];
      const newPolylines: Types.Point2[][] = [];
      for (const currentPolyline of currentPolylines) {
        if (arePolylinesIdentical(currentPolyline, polylineB)) {
          wasSubtracted = true;
          continue;
        }
        const intersection = checkIntersection(currentPolyline, polylineB);
        if (intersection.hasIntersection && !intersection.isContourHole) {
          const subtractedPolylines = math.polyline.subtractPolylines(
            currentPolyline,
            polylineB
          );
          for (const subtractedPolyline of subtractedPolylines) {
            const cleaned = removeDuplicatePoints(subtractedPolyline);
            if (cleaned.length >= 3) {
              newPolylines.push(cleaned);
            }
          }
          wasSubtracted = true;
        } else {
          const cleaned = removeDuplicatePoints(currentPolyline);
          if (cleaned.length >= 3) {
            newPolylines.push(cleaned);
          }
        }
      }
      currentPolylines = newPolylines;
    }
    result.push(...currentPolylines);
    processedFromA.add(i);
  }
  return cleanupPolylines(result);
}

/**
 * Subtracts multiple sets of polylines from a base set progressively.
 * Each set is subtracted from the accumulated result from previous operations.
 */
export function subtractMultiplePolylineSets(
  basePolylineSet: Types.Point2[][],
  subtractorSets: Types.Point2[][][]
): Types.Point2[][] {
  if (subtractorSets.length === 0) {
    return basePolylineSet.map((polyline) => [...polyline]);
  }
  let result = basePolylineSet.map((polyline) => [...polyline]);
  for (let i = 0; i < subtractorSets.length; i++) {
    result = subtractPolylineSets(result, subtractorSets[i]);
  }
  return result;
}

/**
 * Subtracts polylines from annotations by extracting their polylines and subtracting intersecting ones.
 * This is a convenience function that works directly with annotation data.
 */
export function subtractAnnotationPolylines(
  baseAnnotations: Array<{ data: { contour: { polyline: Types.Point3[] } } }>,
  subtractorAnnotations: Array<{
    data: { contour: { polyline: Types.Point3[] } };
  }>,
  viewport: Types.IViewport
): Types.Point2[][] {
  const basePolylines = baseAnnotations.map((annotation) =>
    convertContourPolylineToCanvasSpace(
      annotation.data.contour.polyline,
      viewport
    )
  );
  const subtractorPolylines = subtractorAnnotations.map((annotation) =>
    convertContourPolylineToCanvasSpace(
      annotation.data.contour.polyline,
      viewport
    )
  );
  return subtractPolylineSets(basePolylines, subtractorPolylines);
}
