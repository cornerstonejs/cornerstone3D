import type { Types } from '@cornerstonejs/core';
import type { PolylineInfoCanvas } from './polylineInfoTypes';
import type { ContourSegmentationAnnotation } from '../../types';
import { convertContourPolylineToCanvasSpace } from './sharedOperations';
import { getViewReferenceFromAnnotation } from './getViewReferenceFromAnnotation';
import { runBooleanOpByView } from './polylineSetOps';
import { BooleanOp } from './clipperBooleanOps';
import { getChildAnnotations } from '../../stateManagement/annotation/annotationState';

/**
 * Union two sets of polylines. Overlapping polygons in the same view reference
 * are merged; disjoint polygons pass through unchanged. Holes in either input
 * are preserved if they are not covered by the other input.
 */
export function unifyPolylineSets(
  polylinesSetA: PolylineInfoCanvas[],
  polylinesSetB: PolylineInfoCanvas[]
): PolylineInfoCanvas[] {
  return runBooleanOpByView(polylinesSetA, polylinesSetB, BooleanOp.Union);
}

/**
 * Progressively union multiple sets.
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
  let result: PolylineInfoCanvas[] = polylineSets[0];
  for (let i = 1; i < polylineSets.length; i++) {
    result = unifyPolylineSets(result, polylineSets[i]);
  }
  return result;
}

/**
 * Convenience: union by annotation.
 */
export function unifyAnnotationPolylines(
  annotationsSetA: ContourSegmentationAnnotation[],
  annotationsSetB: ContourSegmentationAnnotation[],
  viewport: Types.IViewport
): PolylineInfoCanvas[] {
  const toInfo = (
    annotation: ContourSegmentationAnnotation
  ): PolylineInfoCanvas => {
    // Holes are stored as child annotations with opposite winding; convert
    // them alongside the outer polyline so Union can preserve them.
    const holePolylines = getChildAnnotations(annotation).map((child) =>
      convertContourPolylineToCanvasSpace(
        (child as ContourSegmentationAnnotation).data.contour.polyline,
        viewport
      )
    );
    return {
      polyline: convertContourPolylineToCanvasSpace(
        annotation.data.contour.polyline,
        viewport
      ),
      viewReference: getViewReferenceFromAnnotation(annotation),
      ...(holePolylines.length ? { holePolylines } : {}),
    };
  };
  return unifyPolylineSets(
    annotationsSetA.map(toInfo),
    annotationsSetB.map(toInfo)
  );
}
