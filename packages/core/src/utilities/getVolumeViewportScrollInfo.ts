import { IVolumeViewport } from '../types';
import getVolumeSliceRangeInfo from './getVolumeSliceRangeInfo';

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
  const { sliceRange, spacingInNormalDirection, camera } =
    getVolumeSliceRangeInfo(viewport, volumeId, useSlabThickness);

  const { min, max, current } = sliceRange;

  // Now we can see how many steps there are in this direction
  const numScrollSteps = Math.round((max - min) / spacingInNormalDirection);

  // Find out current frameIndex
  const fraction = (current - min) / (max - min);
  const floatingStepNumber = fraction * numScrollSteps;
  const currentStepIndex = Math.round(floatingStepNumber);

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
