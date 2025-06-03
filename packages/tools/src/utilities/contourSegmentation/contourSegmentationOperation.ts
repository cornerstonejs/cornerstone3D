import type { Types } from '@cornerstonejs/core';
import type { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';
import { getAnnotation } from '../../stateManagement/annotation/annotationState';
import getViewportsForAnnotation from '../getViewportsForAnnotation';
import {
  convertContourPolylineToCanvasSpace,
  checkIntersection,
  createPolylineHole,
  combinePolylines,
} from './sharedOperations';

/**
 * Processes two contour segmentation annotations by performing merge, subtract, or hole operations.
 * This function replicates the core logic from contourSegmentationCompletedListener but operates
 * on two specific annotations without searching for others.
 *
 * @param sourceAnnotationOrUID - The source annotation or its UID
 * @param targetAnnotationOrUID - The target annotation or its UID
 * @param viewport - Optional viewport context. If not provided, will be determined from annotations
 * @param contourHoleProcessingEnabled - Whether to allow hole creation (default: true)
 * @returns Promise that resolves when the processing is complete
 */
export async function contourSegmentationOperation(
  sourceAnnotationOrUID: ContourSegmentationAnnotation | string,
  targetAnnotationOrUID: ContourSegmentationAnnotation | string,
  viewport?: Types.IViewport,
  contourHoleProcessingEnabled: boolean = true
): Promise<void> {
  // Resolve annotations from UIDs if needed
  const sourceAnnotation =
    typeof sourceAnnotationOrUID === 'string'
      ? (getAnnotation(sourceAnnotationOrUID) as ContourSegmentationAnnotation)
      : sourceAnnotationOrUID;

  const targetAnnotation =
    typeof targetAnnotationOrUID === 'string'
      ? (getAnnotation(targetAnnotationOrUID) as ContourSegmentationAnnotation)
      : targetAnnotationOrUID;

  if (!sourceAnnotation || !targetAnnotation) {
    throw new Error('Both source and target annotations must be valid');
  }

  // Get viewport if not provided
  if (!viewport) {
    viewport = getViewportFromAnnotation(sourceAnnotation);
  }

  // Convert polylines to canvas space using shared function
  const sourcePolyline = convertContourPolylineToCanvasSpace(
    sourceAnnotation.data.contour.polyline,
    viewport
  );

  const targetPolyline = convertContourPolylineToCanvasSpace(
    targetAnnotation.data.contour.polyline,
    viewport
  );

  // Check for intersection using shared function
  const intersectionInfo = checkIntersection(sourcePolyline, targetPolyline);

  if (!intersectionInfo.hasIntersection) {
    console.warn('No intersection found between the two annotations');
    return;
  }

  if (intersectionInfo.isContourHole) {
    if (!contourHoleProcessingEnabled) {
      console.warn('Hole processing is disabled');
      return;
    }

    // Create hole operation using shared function
    createPolylineHole(viewport, targetAnnotation, sourceAnnotation);
  } else {
    // Combine/subtract operation using shared function
    combinePolylines(
      viewport,
      targetAnnotation,
      targetPolyline,
      sourceAnnotation,
      sourcePolyline
    );
  }
}

/**
 * Gets a suitable viewport from an annotation
 */
function getViewportFromAnnotation(
  annotation: ContourSegmentationAnnotation
): Types.IViewport {
  const viewports = getViewportsForAnnotation(annotation);
  if (!viewports.length) {
    throw new Error('No viewport found for the annotation');
  }
  return viewports[0];
}
