import type { ContourSegmentationAnnotation } from '../../types/ContourSegmentationAnnotation';

/**
 * Compares two ContourSegmentationAnnotations to determine if they belong to the same segment.
 *
 * @param firstAnnotation - The first ContourSegmentationAnnotation to compare.
 * @param secondAnnotation - The second ContourSegmentationAnnotation to compare.
 * @returns True if both annotations belong to the same segment, false otherwise.
 */
export default function areSameSegment(
  firstAnnotation: ContourSegmentationAnnotation,
  secondAnnotation: ContourSegmentationAnnotation
): boolean {
  const { segmentation: firstSegmentation } = firstAnnotation.data;
  const { segmentation: secondSegmentation } = secondAnnotation.data;

  return (
    firstSegmentation.segmentationId === secondSegmentation.segmentationId &&
    firstSegmentation.segmentIndex === secondSegmentation.segmentIndex
  );
}
