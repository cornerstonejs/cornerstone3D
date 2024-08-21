import type { Segmentation } from '../../types';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Get the segmentation for the given segmentationId
 * @param segmentationId - The Id of the segmentation
 * @returns A Segmentation object
 */
export function getSegmentation(
  segmentationId: string
): Segmentation | undefined {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getSegmentation(segmentationId);
}
