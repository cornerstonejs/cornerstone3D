import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Finds a segmentation representation by its UID.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation to find.
 * @returns The found segmentation representation, or undefined if not found.
 */
export function getSegmentationRepresentation(
  segmentationRepresentationUID: string
): SegmentationRepresentation | undefined {
  const segmentationStateManager = defaultSegmentationStateManager;
  const representation = segmentationStateManager.getSegmentationRepresentation(
    segmentationRepresentationUID
  );

  if (!representation) {
    return undefined;
  }

  return representation;
}
