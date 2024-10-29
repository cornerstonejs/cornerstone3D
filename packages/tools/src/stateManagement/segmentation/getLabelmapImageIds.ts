import { getSegmentation } from './getSegmentation';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the labelmap image IDs for a given segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of labelmap image IDs.
 */
export function getLabelmapImageIds(
  segmentationId: string
): string | undefined {
  const segmentationStateManager = defaultSegmentationStateManager;
  const segmentation = getSegmentation(segmentationId);
  return segmentationStateManager.getLabelmapImageIds(
    segmentation.representationData
  );
}
