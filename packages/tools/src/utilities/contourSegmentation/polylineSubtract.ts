import type { Types } from '@cornerstonejs/core';
import type { PolylineInfoCanvas } from './polylineInfoTypes';
import type { ContourSegmentationAnnotation } from '../../types';
import { convertContourPolylineToCanvasSpace } from './sharedOperations';
import { getViewReferenceFromAnnotation } from './getViewReferenceFromAnnotation';
import { runBooleanOpByView } from './polylineSetOps';
import { BooleanOp } from './clipperBooleanOps';

/**
 * Subtract polylines in `polylinesSetB` from `polylinesSetA`. Holes are
 * preserved through the operation (Clipper handles edge crossings, full
 * containment, and hole-vs-subtrahend interactions uniformly).
 */
export function subtractPolylineSets(
  polylinesSetA: PolylineInfoCanvas[],
  polylinesSetB: PolylineInfoCanvas[]
): PolylineInfoCanvas[] {
  return runBooleanOpByView(polylinesSetA, polylinesSetB, BooleanOp.Difference);
}

/**
 * Progressively subtract multiple sets from a base set.
 */
export function subtractMultiplePolylineSets(
  basePolylineSet: PolylineInfoCanvas[],
  subtractorSets: PolylineInfoCanvas[][]
): PolylineInfoCanvas[] {
  if (subtractorSets.length === 0) {
    return [...basePolylineSet];
  }
  let result: PolylineInfoCanvas[] = basePolylineSet;
  for (const subtractor of subtractorSets) {
    result = subtractPolylineSets(result, subtractor);
  }
  return result;
}

/**
 * Convenience: subtract by annotation. Carries each annotation's child (hole)
 * annotations into the operation so the subtraction respects existing holes.
 */
export function subtractAnnotationPolylines(
  baseAnnotations: ContourSegmentationAnnotation[],
  subtractorAnnotations: ContourSegmentationAnnotation[],
  viewport: Types.IViewport
): PolylineInfoCanvas[] {
  const toInfo = (
    annotation: ContourSegmentationAnnotation
  ): PolylineInfoCanvas => {
    const info: PolylineInfoCanvas = {
      polyline: convertContourPolylineToCanvasSpace(
        annotation.data.contour.polyline,
        viewport
      ),
      viewReference: getViewReferenceFromAnnotation(annotation),
    };
    return info;
  };
  return subtractPolylineSets(
    baseAnnotations.map(toInfo),
    subtractorAnnotations.map(toInfo)
  );
}
