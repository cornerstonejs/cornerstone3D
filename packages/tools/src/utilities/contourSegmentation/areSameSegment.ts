import { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';

/**
 * Check if two contour segmentations are from same segmentId,
 * segmentationRepresentationUID and segmentIndex.
 * @param firstAnnotation - First annotation
 * @param secondAnnotation - Second annotation
 * @returns True if they are from same segmentId, segmentationRepresentationUID
 * and segmentIndex or false otherwise.
 */
export default function areSameSegment(
  firstAnnotation: ContourSegmentationAnnotation,
  secondAnnotation: ContourSegmentationAnnotation
) {
  const { segmentation: firstSegmentation } = firstAnnotation.data;
  const { segmentation: secondSegmentation } = secondAnnotation.data;

  return (
    firstSegmentation.segmentationId === secondSegmentation.segmentationId &&
    firstSegmentation.segmentIndex === secondSegmentation.segmentIndex
  );
}
