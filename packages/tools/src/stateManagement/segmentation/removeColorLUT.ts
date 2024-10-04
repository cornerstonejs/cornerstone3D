import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Add a color LUT to the segmentation state manager
 * @param colorLUT - The color LUT array to add.
 * @param index - The index of the color LUT to add.
 */
export function removeColorLUT(colorLUTIndex: number): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.removeColorLUT(colorLUTIndex);
}
