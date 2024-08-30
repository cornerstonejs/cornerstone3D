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
  let colorLUTToUse = colorLUT;
  // make sure the colorLUT is always starts at [0, 0, 0, 0], and
  // also has multiple entries, and if it is missing get it from
  // constant CORNERSTONE_COLOR_LUT
  // Append the "zero" (no label) color to the front of the LUT, if necessary.
  if (!utilities.isEqual(colorLUTToUse[0], [0, 0, 0, 0])) {
    console.warn(
      'addColorLUT: [0, 0, 0, 0] color is not provided for the background color (segmentIndex =0), automatically adding it'
    );
    colorLUTToUse.unshift([0, 0, 0, 0]);
  }

  if (colorLUT.length < 255) {
    // use whatever is missing from CORNERSTONE_COLOR_LUT
    const missingColorLUTs = CORNERSTONE_COLOR_LUT.slice(colorLUTToUse.length);
    colorLUTToUse = [...colorLUTToUse, ...missingColorLUTs] as Types.ColorLUT;
  }

  segmentationStateManager.addColorLUT(colorLUTToUse, indexToUse);

  return indexToUse;
}
