import { Types } from '@cornerstonejs/core';
import { TypedArray } from '@kitware/vtk.js/types';

function isWithinThreshold(
  index: number,
  imageScalarData: TypedArray,
  strategySpecificConfiguration: any
) {
  const { THRESHOLD_INSIDE_CIRCLE } = strategySpecificConfiguration;

  const voxelValue = imageScalarData[index];
  const { threshold } = THRESHOLD_INSIDE_CIRCLE;

  return threshold[0] <= voxelValue && voxelValue <= threshold[1];
}

export default isWithinThreshold;
