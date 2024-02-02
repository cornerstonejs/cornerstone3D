import { getSegmentation } from '../../stateManagement/segmentation/segmentationState';
import { ContourSegmentationAnnotation } from '../../types';

/**
 * Adds a contour segmentation annotation to the specified segmentation.
 * @param annotation - The contour segmentation annotation to add.
 */
export function addContourSegmentationAnnotation(
  annotation: ContourSegmentationAnnotation
) {
  if (!annotation.data.segmentation) {
    throw new Error(
      'addContourSegmentationAnnotation: annotation does not have a segmentation data'
    );
  }

  const { segmentationId, segmentIndex } = annotation.data.segmentation;
  const segmentation = getSegmentation(segmentationId);
  const { annotationUIDsMap } = segmentation.representationData.CONTOUR;

  let annotationsUIDsSet = annotationUIDsMap.get(segmentIndex);

  if (!annotationsUIDsSet) {
    annotationsUIDsSet = new Set();
    annotationUIDsMap.set(segmentIndex, annotationsUIDsSet);
  }

  annotationsUIDsSet.add(annotation.annotationUID);
}
