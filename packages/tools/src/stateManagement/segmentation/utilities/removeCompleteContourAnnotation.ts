import type { ContourSegmentationAnnotation } from '../../../types';
import { removeContourSegmentationAnnotation } from '../../../utilities/contourSegmentation';
import {
  clearParentAnnotation,
  removeAnnotation,
} from '../../annotation/annotationState';

/**
 * Completely removes a contour segmentation annotation and cleans up all references.
 * This function handles both the annotation state removal and the segmentation data cleanup,
 * including removing parent-child relationships if they exist.
 *
 * @param annotation - The contour segmentation annotation to remove
 */
export function removeCompleteContourAnnotation(
  annotation: ContourSegmentationAnnotation
) {
  if (!annotation) {
    return;
  }
  // deleting reference of the child in the parent annotation
  if (annotation.parentAnnotationUID) {
    clearParentAnnotation(annotation);
  }
  removeAnnotation(annotation.annotationUID);
  removeContourSegmentationAnnotation(annotation);
}
