import { Types, utilities as csUtils } from '@cornerstonejs/core';

function getVolumeViewportScrollInfo(
  viewport: Types.IVolumeViewport,
  volumeId: string
) {
  const { sliceRange, spacingInNormalDirection } =
    csUtils.getVolumeSliceRangeInfo(viewport, volumeId);

  const { min, max, current } = sliceRange;

  // Now we can see how many steps there are in this direction
  const numScrollSteps = Math.round((max - min) / spacingInNormalDirection);

  // Find out current frameIndex
  const fraction = (current - min) / (max - min);
  const floatingStepNumber = fraction * numScrollSteps;
  const currentFrameIndex = Math.round(floatingStepNumber);

  return { numScrollSteps, currentFrameIndex };
}

export default getVolumeViewportScrollInfo;
