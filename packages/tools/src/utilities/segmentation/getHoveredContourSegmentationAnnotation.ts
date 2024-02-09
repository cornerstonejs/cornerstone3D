import { getAnnotation } from '../../stateManagement';
import { getSegmentation } from '../../stateManagement/segmentation/segmentationState';

/**
 * Retrieves the index of the hovered contour segmentation annotation for a given segmentation ID.
 *
 * @param segmentationId - The ID of the segmentation.
 * @returns The index of the hovered contour segmentation annotation, or undefined if none is found.
 */
export function getHoveredContourSegmentationAnnotation(segmentationId) {
  const segmentation = getSegmentation(segmentationId);
  const { annotationUIDsMap } = segmentation.representationData.CONTOUR;

  for (const [segmentIndex, annotationUIDs] of annotationUIDsMap.entries()) {
    const highlightedAnnotationUID = Array.from(annotationUIDs).find(
      (annotationUID) => getAnnotation(annotationUID).highlighted
    );

    if (highlightedAnnotationUID) {
      return segmentIndex;
    }
  }

  return undefined;
}
