import { state } from '../../stateManagement/segmentation';
import { ContourSegmentationAnnotation } from '../../types';

/**
 * Removes a contour segmentation annotation from the given annotation.
 * If the annotation does not have a segmentation data, an error is thrown.
 * @param annotation - The contour segmentation annotation to remove.
 * @throws Error if the annotation does not have a segmentation data.
 */
export function removeContourSegmentationAnnotation(
  annotation: ContourSegmentationAnnotation
) {
  if (!annotation.data.segmentation) {
    throw new Error(
      'removeContourSegmentationAnnotation: annotation does not have a segmentation data'
    );
  }

  const { segmentationId, segmentIndex } = annotation.data.segmentation;
  const segmentation = state.getSegmentation(segmentationId);
  const { annotationUIDsMap } = segmentation.representationData.CONTOUR;
  const annotationsUIDsSet = annotationUIDsMap.get(segmentIndex);

  if (!annotationsUIDsSet) {
    return;
  }

  annotationsUIDsSet.delete(annotation.annotationUID);

  // Delete segmentIndex Set if there is no more annotations
  if (!annotationsUIDsSet.size) {
    annotationUIDsMap.delete(segmentIndex);
  }
}
