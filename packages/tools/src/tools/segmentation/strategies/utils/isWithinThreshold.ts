import { Types } from '@cornerstonejs/core';

function isWithinThreshold(
  index: number,
  imageScalarData: Types.PixelDataTypedArray,
  strategySpecificConfiguration: any
) {
  const { THRESHOLD, THRESHOLD_INSIDE_CIRCLE } = strategySpecificConfiguration;

  const voxelValue = imageScalarData[index];
  // Prefer the generic version of the THRESHOLD configuration, but fallback
  // to the older THRESHOLD_INSIDE_CIRCLE version.
  const { threshold } = THRESHOLD || THRESHOLD_INSIDE_CIRCLE;
  return threshold[0] <= voxelValue && voxelValue <= threshold[1];
}

export default isWithinThreshold;
