import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import { getAllSegmentationRepresentations } from './getAllSegmentationRepresentations';

/**
 * Finds all segmentation representations with the given segmentationId.
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of found segmentation representations.
 */
export function getSegmentationRepresentationsForSegmentation(
  segmentationId: string
): SegmentationRepresentation[] {
  const allRepresentations = getAllSegmentationRepresentations();
  return allRepresentations.filter(
    (representation) => representation.segmentationId === segmentationId
  );
}
