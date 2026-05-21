import type { Types } from '@cornerstonejs/core';
import * as math from '../math';
import {
  checkIntersection,
  cleanupPolylines,
  convertContourPolylineToCanvasSpace,
  removeDuplicatePoints,
} from './sharedOperations';
import arePolylinesIdentical from '../math/polyline/arePolylinesIdentical';
import containsPoints from '../math/polyline/containsPoints';
import type { PolylineInfoCanvas } from './polylineInfoTypes';
import type { ContourSegmentationAnnotation } from '../../types';
import { getViewReferenceFromAnnotation } from './getViewReferenceFromAnnotation';
import { areViewReferencesEqual } from './areViewReferencesEqual';

/**
 * Subtracts polylines in set2 from set1, returning only those in set1 that are not present in set2.
 * Comparison is done by polyline and viewReference.
 *
 * @param polylinesSetA The minuend set of PolylineInfoCanvas
 * @param polylinesSetB The subtrahend set of PolylineInfoCanvas
 * @returns Array of PolylineInfoCanvas in set1 but not in set2
 */
export function subtractPolylineSets(
  polylinesSetA: PolylineInfoCanvas[],
  polylinesSetB: PolylineInfoCanvas[]
): PolylineInfoCanvas[] {
  const result: PolylineInfoCanvas[] = [];
  for (let i = 0; i < polylinesSetA.length; i++) {
    let currentPolylines = [polylinesSetA[i]];
    for (let j = 0; j < polylinesSetB.length; j++) {
      const polylineB = polylinesSetB[j];
      const newPolylines: PolylineInfoCanvas[] = [];
      for (const currentPolyline of currentPolylines) {
        if (
          !areViewReferencesEqual(
            currentPolyline.viewReference,
            polylineB.viewReference
          )
        ) {
          // If viewReference does not match, keep the polyline for further checks
          newPolylines.push(currentPolyline);
          continue;
        }
        if (
          arePolylinesIdentical(currentPolyline.polyline, polylineB.polyline)
        ) {
          // Polyline is identical, so it is subtracted (not added to newPolylines)
          continue;
        }
        const intersection = checkIntersection(
          currentPolyline.polyline,
          polylineB.polyline
        );
        if (intersection.hasIntersection && !intersection.isContourHole) {
          const subtractedPolylines = cleanupPolylines(
            math.polyline.subtractPolylines(
              currentPolyline.polyline,
              polylineB.polyline
            )
          );
          const existingHoles = currentPolyline.holePolylines ?? [];
          for (const subtractedPolyline of subtractedPolylines) {
            const cleaned = removeDuplicatePoints(subtractedPolyline);
            if (cleaned.length >= 3) {
              const holesStillInside = existingHoles.filter((hole) =>
                containsPoints(cleaned, hole)
              );
              newPolylines.push({
                polyline: cleaned,
                viewReference: currentPolyline.viewReference,
                ...(holesStillInside.length > 0
                  ? { holePolylines: holesStillInside }
                  : {}),
              });
            }
          }
        } else if (
          containsPoints(currentPolyline.polyline, polylineB.polyline)
        ) {
          const existingHoles = currentPolyline.holePolylines ?? [];
          const isInsideExistingHole = existingHoles.some((hole) =>
            containsPoints(hole, polylineB.polyline)
          );
          if (isInsideExistingHole) {
            // It's already in a hole, so subtracting it changes nothing.
            newPolylines.push({
              polyline: currentPolyline.polyline,
              viewReference: currentPolyline.viewReference,
              ...(currentPolyline.holePolylines
                ? { holePolylines: currentPolyline.holePolylines }
                : {}),
            });
          } else {
            // Subtrahend is fully inside the minuend — cut a hole (no edge crossings).
            newPolylines.push({
              polyline: currentPolyline.polyline,
              viewReference: currentPolyline.viewReference,
              holePolylines: [
                ...(currentPolyline.holePolylines ?? []),
                polylineB.polyline,
              ],
            });
          }
        } else if (
          containsPoints(polylineB.polyline, currentPolyline.polyline)
        ) {
          // Minuend is fully inside the subtrahend — removed entirely.
          continue;
        } else {
          newPolylines.push({
            polyline: currentPolyline.polyline,
            viewReference: currentPolyline.viewReference,
            ...(currentPolyline.holePolylines
              ? { holePolylines: currentPolyline.holePolylines }
              : {}),
          });
        }
      }
      currentPolylines = newPolylines;
    }
    result.push(...currentPolylines);
  }
  return result;
}

/**
 * Subtracts multiple sets of polylines from a base set progressively.
 * Each set is subtracted from the accumulated result from previous operations.
 */
export function subtractMultiplePolylineSets(
  basePolylineSet: PolylineInfoCanvas[],
  subtractorSets: PolylineInfoCanvas[][]
): PolylineInfoCanvas[] {
  if (subtractorSets.length === 0) {
    return [...basePolylineSet];
  }
  let result = [...basePolylineSet];
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
  baseAnnotations: ContourSegmentationAnnotation[],
  subtractorAnnotations: ContourSegmentationAnnotation[],
  viewport: Types.IViewport
): PolylineInfoCanvas[] {
  const basePolylines = baseAnnotations.map((annotation) => ({
    polyline: convertContourPolylineToCanvasSpace(
      annotation.data.contour.polyline,
      viewport
    ),
    viewReference: getViewReferenceFromAnnotation(annotation),
  }));
  const subtractorPolylines = subtractorAnnotations.map((annotation) => ({
    polyline: convertContourPolylineToCanvasSpace(
      annotation.data.contour.polyline,
      viewport
    ),
    viewReference: getViewReferenceFromAnnotation(annotation),
  }));
  return subtractPolylineSets(basePolylines, subtractorPolylines);
}
