import type { IVolumeViewport } from '../types';
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

  const range = max - min;

  // A single-slice volume collapses the range to zero (min === max === current).
  // Guard against it so `(current - min) / range` doesn't evaluate to 0 / 0 = NaN,
  // which would propagate to getCurrentImageIdIndex() and the overlay (rendering
  // "NaN/1" and an undefined imageId).
  const numScrollSteps =
    range === 0 ? 0 : Math.round(range / spacingInNormalDirection);

  // Find out current frameIndex
  const fraction = range === 0 ? 0 : (current - min) / range;
  const floatingStepNumber = fraction * numScrollSteps;
  const currentStepIndex = Number.isFinite(floatingStepNumber)
    ? Math.round(floatingStepNumber)
    : 0;

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
