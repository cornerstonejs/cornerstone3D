import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import type { ContourSegmentationAnnotation } from '../../types';

/**
 * Adds a contour segmentation annotation to the specified segmentation.
 * @param annotation - The contour segmentation annotation to add.
 */
export function addContourSegmentationAnnotation(
  annotation: ContourSegmentationAnnotation
) {
  if (annotation.parentAnnotationUID) {
    // Don't add it for parent annotations - this happens during interpolation
    return;
  }
  if (!annotation.data.segmentation) {
    throw new Error(
      'addContourSegmentationAnnotation: annotation does not have a segmentation data'
    );
  }

  const { segmentationId, segmentIndex } = annotation.data.segmentation;
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation.representationData.Contour) {
    segmentation.representationData.Contour = { annotationUIDsMap: new Map() };
  }

  const { annotationUIDsMap } = segmentation.representationData.Contour;

  let annotationsUIDsSet = annotationUIDsMap.get(segmentIndex);

  if (!annotationsUIDsSet) {
    annotationsUIDsSet = new Set();
    annotationUIDsMap.set(segmentIndex, annotationsUIDsSet);
  }

  annotationUIDsMap.set(
    segmentIndex,
    annotationsUIDsSet.add(annotation.annotationUID)
  );
}
