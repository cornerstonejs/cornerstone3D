import type { IVolumeViewport } from '../types';
import getVolumeSliceRangeInfo from './getVolumeSliceRangeInfo';
import getVolumeSliceGrid, { getSliceGridIndex } from './getVolumeSliceGrid';

/**
 * Calculates the number os steps the volume can scroll based on its orientation
 * @param viewport - Volume viewport
 * @param volumeId - Id of one of the volumes loaded on the given viewport
 * @param useSlabThickness - If true, the number of steps will be calculated
 * based on the slab thickness instead of the spacing in the normal direction
 * @returns number of steps the volume can scroll and its current position
 */
function getVolumeViewportScrollInfo(
  viewport: IVolumeViewport,
  volumeId: string,
  useSlabThickness = false
) {
  const rangeInfo = getVolumeSliceRangeInfo(
    viewport,
    volumeId,
    useSlabThickness
  );

  if (!rangeInfo) {
    // The viewport holds no volume that the range applies to. It therefore
    // scrolls no steps, and every caller already returns for that answer.
    return { numScrollSteps: 0, currentStepIndex: 0, sliceRangeInfo: null };
  }

  const { sliceRange, spacingInNormalDirection, camera } = rangeInfo;
  const { min, max, current } = sliceRange;

  // A single-slice volume collapses the range to zero; the grid then has no
  // steps and index 0, so no NaN reaches getCurrentImageIdIndex() or the overlay.
  const grid = getVolumeSliceGrid(min, max, spacingInNormalDirection);
  const numScrollSteps = grid.maxIndex;
  const currentStepIndex = getSliceGridIndex(grid, current);

  return {
    numScrollSteps,
    currentStepIndex,
    sliceRangeInfo: {
      sliceRange,
      spacingInNormalDirection,
      camera,
    },
  };
}

export default getVolumeViewportScrollInfo;
