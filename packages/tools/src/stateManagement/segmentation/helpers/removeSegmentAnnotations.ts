import type { ContourSegmentationAnnotation } from '../../../types/ContourSegmentationAnnotation';
import { getAnnotation } from '../../annotation/annotationState';
import {
  getAnnotationsUIDMapFromSegmentation,
  removeCompleteContourAnnotation,
} from '../utilities';
import { isContourSegmentationAnnotation } from '../../../utilities/contourSegmentation';

/**
 * Clears/removes all contour segment annotations for a given segment index.
 *
 * @param segmentationId - The unique identifier of the segmentation.
 * @param segmentIndex - The index of the segment to clear/remove the annotations from.
 */
export function removeContourSegmentAnnotations(
  segmentationId: string,
  segmentIndex: number
) {
  const annotationUIDsMap =
    getAnnotationsUIDMapFromSegmentation(segmentationId);
  if (!annotationUIDsMap) {
    return;
  }

  const annotationUIDs = annotationUIDsMap.get(segmentIndex);
  if (!annotationUIDs) {
    return;
  }

  annotationUIDs.forEach((annotationUID) => {
    const annotation = getAnnotation(annotationUID);
    if (isContourSegmentationAnnotation(annotation)) {
      removeCompleteContourAnnotation(annotation);
    }
  });
}
