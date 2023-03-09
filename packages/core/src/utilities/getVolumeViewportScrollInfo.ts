import { IVolumeViewport } from '../types';
import getVolumeSliceRangeInfo from './getVolumeSliceRangeInfo';

function getVolumeViewportScrollInfo(
  viewport: IVolumeViewport,
  volumeId: string
) {
  const { sliceRange, spacingInNormalDirection } = getVolumeSliceRangeInfo(
    viewport,
    volumeId
  );

  const { min, max, current } = sliceRange;

  // Now we can see how many steps there are in this direction
  const numScrollSteps = Math.round((max - min) / spacingInNormalDirection);

  // Find out current frameIndex
  const fraction = (current - min) / (max - min);
  const floatingStepNumber = fraction * numScrollSteps;
  const currentStepIndex = Math.round(floatingStepNumber);

  return { numScrollSteps, currentStepIndex };
}

export default getVolumeViewportScrollInfo;
