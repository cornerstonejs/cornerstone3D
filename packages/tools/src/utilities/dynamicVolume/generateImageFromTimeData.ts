import { Enums, Types } from '@cornerstonejs/core';

const operationFunctions = {
  [Enums.GenerateImageType.SUM]: (voxelManager, frames, arrayLength) => {
    const finalArray = new Float32Array(arrayLength);
    for (const timepoint of frames) {
      for (let j = 0; j < arrayLength; j++) {
        finalArray[j] += voxelManager.getAtIndexAndTimePoint(j, timepoint);
      }
    }
    return finalArray;
  },

  [Enums.GenerateImageType.SUBTRACT]: (voxelManager, frames, arrayLength) => {
    if (frames.length !== 2) {
      throw new Error('Please provide only 2 time points for subtraction.');
    }
    const finalArray = new Float32Array(arrayLength);
    for (let j = 0; j < arrayLength; j++) {
      finalArray[j] =
        voxelManager.getAtIndexAndTimePoint(j, frames[0]) -
        voxelManager.getAtIndexAndTimePoint(j, frames[1]);
    }
    return finalArray;
  },

  [Enums.GenerateImageType.AVERAGE]: (voxelManager, frames, arrayLength) => {
    const finalArray = new Float32Array(arrayLength);
    for (const timepoint of frames) {
      for (let j = 0; j < arrayLength; j++) {
        finalArray[j] += voxelManager.getAtIndexAndTimePoint(j, timepoint);
      }
    }
    for (let k = 0; k < arrayLength; k++) {
      finalArray[k] /= frames.length;
    }
    return finalArray;
  },
};

/**
 * Gets the scalar data for a series of time frames from a 4D volume, returns an
 * array of scalar data after performing AVERAGE, SUM or SUBTRACT to be used to
 * create a 3D volume
 *
 * @param dynamicVolume4D - volume to compute time frame data from
 * @param operation - operation to perform on time frame data, operations include
 * SUM, AVERAGE, and SUBTRACT (can only be used with 2 time frames provided)
 * @param frameNumbers - an array of frame indices to perform the operation on, if
 * left empty, all frames will be used
 * @returns
 */
function generateImageFromTimeData(
  dynamicVolume: Types.IDynamicImageVolume,
  operation: Enums.GenerateImageType,
  frameNumbers?: number[]
) {
  const frames = frameNumbers || [...Array(dynamicVolume.numTimePoints).keys()];

  if (frames.length <= 1) {
    throw new Error('Please provide two or more time points');
  }

  const voxelManager = dynamicVolume.voxelManager;
  const arrayLength = voxelManager.getScalarDataLength();

  const operationFunction = operationFunctions[operation];

  if (!operationFunction) {
    throw new Error(`Unsupported operation: ${operation}`);
  }

  return operationFunction(voxelManager, frames, arrayLength);
}

export default generateImageFromTimeData;
