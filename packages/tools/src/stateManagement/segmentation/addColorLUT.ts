import type { Types } from '@cornerstonejs/core';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Add a color LUT to the segmentation state manager
 * @param colorLUT - The color LUT array to add.
 * @param index - The index of the color LUT to add.
 */
export function addColorLUT(colorLUT: Types.ColorLUT, index: number): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.addColorLUT(colorLUT, index);
  // Todo: trigger event color LUT added
}
