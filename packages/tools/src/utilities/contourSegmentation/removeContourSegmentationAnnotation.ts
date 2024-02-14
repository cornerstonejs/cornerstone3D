import { state } from '../../stateManagement/segmentation';
import { ContourSegmentationAnnotation } from '../../types';

/**
 * Removes a contour segmentation annotation from the given annotation.
 * If the annotation does not have a segmentation data, this method returns
 * quietly.  This can occur for interpolated segmentations that have not yet
 * been converted to real segmentations or other in-process segmentations.
 * @param annotation - The contour segmentation annotation to remove.
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
  const { annotationUIDsMap } = segmentation?.representationData.CONTOUR || {};
  const annotationsUIDsSet = annotationUIDsMap?.get(segmentIndex);

  if (!annotationsUIDsSet) {
    return;
  }

  annotationsUIDsSet.delete(annotation.annotationUID);

  // Delete segmentIndex Set if there is no more annotations
  if (!annotationsUIDsSet.size) {
    annotationUIDsMap.delete(segmentIndex);
  }
}
