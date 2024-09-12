import { type Types, utilities } from '@cornerstonejs/core';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { getNextColorLUTIndex } from './getNextColorLUTIndex';
import CORNERSTONE_COLOR_LUT from '../../constants/COLOR_LUT';

/**
 * Add a color LUT to the segmentation state manager
 * @param colorLUT - The color LUT array to add.
 * @param index - The index of the color LUT to add.
 *
 * If no index is provided, the next available index will be used.
 *
 * @returns The index of the color LUT that was added.
 */
export function addColorLUT(colorLUT: Types.ColorLUT, index?: number): number {
  const segmentationStateManager = defaultSegmentationStateManager;

  const indexToUse = index ?? getNextColorLUTIndex();
  let colorLUTToUse = [...colorLUT] as Types.ColorLUT;

  // Make sure the colorLUT always starts with [0, 0, 0, 0] for the background color
  if (!utilities.isEqual(colorLUTToUse[0], [0, 0, 0, 0])) {
    console.warn(
      'addColorLUT: [0, 0, 0, 0] color is not provided for the background color (segmentIndex =0), automatically adding it'
    );
    colorLUTToUse = [[0, 0, 0, 0], ...colorLUTToUse];
  }

  // Ensure the colorLUT has at least 255 entries
  if (colorLUTToUse.length < 255) {
    const missingColorLUTs = CORNERSTONE_COLOR_LUT.slice(colorLUTToUse.length);
    colorLUTToUse = [...colorLUTToUse, ...missingColorLUTs] as Types.ColorLUT;
  }

  segmentationStateManager.addColorLUT(colorLUTToUse, indexToUse);

  return indexToUse;
}
