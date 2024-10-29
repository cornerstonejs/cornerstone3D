import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the index for the next available color in the Look-Up Table (LUT).
 *
 * This function uses the default segmentation state manager to get the next
 * available color index from the LUT. This is typically used when assigning
 * colors to new segments in a segmentation.
 *
 * @returns {number} The index of the next available color in the LUT.
 */
export function getNextColorLUTIndex(): number {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getNextColorLUTIndex();
}
