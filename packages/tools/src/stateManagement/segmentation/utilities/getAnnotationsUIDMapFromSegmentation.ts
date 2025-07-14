import type { ContourSegmentationData } from '../../../types';
import { getSegmentation } from '../getSegmentation';

/**
 * Retrieves the annotationUIDsMap for a given segmentation ID, if available.
 *
 * @param segmentationId - The segmentation ID
 * @returns The annotationUIDsMap (Map of segmentIndex or Set of annotationUID) or undefined
 */
export function getAnnotationsUIDMapFromSegmentation(segmentationId: string) {
  const segmentation = getSegmentation(segmentationId);
  if (!segmentation) {
    return;
  }

  const contourRepresentationData = segmentation.representationData
    ?.Contour as ContourSegmentationData;

  if (!contourRepresentationData) {
    return;
  }

  const { annotationUIDsMap } = contourRepresentationData;
  if (!annotationUIDsMap) {
    return;
  }
  return annotationUIDsMap;
}
