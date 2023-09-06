import { Types } from '@cornerstonejs/core';

function isWithinThreshold(
  index: number,
  imageVolume: Types.IImageVolume,
  strategySpecificConfiguration: any
) {
  const { THRESHOLD_INSIDE_CIRCLE } = strategySpecificConfiguration;

  const voxelValue = imageVolume.getScalarData()[index];
  const { threshold } = THRESHOLD_INSIDE_CIRCLE;

  return threshold[0] <= voxelValue && voxelValue <= threshold[1];
}

export default isWithinThreshold;
