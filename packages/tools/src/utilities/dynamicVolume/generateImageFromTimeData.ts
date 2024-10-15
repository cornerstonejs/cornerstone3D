import type { Types } from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/core';

const operationFunctions = {
  [Enums.GenerateImageType.SUM]: (voxelManager, frames, callback) => {
    const arrayLength = voxelManager.getScalarDataLength();
    for (let j = 0; j < arrayLength; j++) {
      let sum = 0;
      for (const timepoint of frames) {
        sum += voxelManager.getAtIndexAndTimePoint(j, timepoint);
      }
      callback(j, sum);
    }
  },

  [Enums.GenerateImageType.SUBTRACT]: (voxelManager, frames, callback) => {
    if (frames.length !== 2) {
      throw new Error('Please provide only 2 time points for subtraction.');
    }

    const arrayLength = voxelManager.getScalarDataLength();
    for (let j = 0; j < arrayLength; j++) {
      const difference =
        voxelManager.getAtIndexAndTimePoint(j, frames[0]) -
        voxelManager.getAtIndexAndTimePoint(j, frames[1]);
      callback(j, difference);
    }
  },

  [Enums.GenerateImageType.AVERAGE]: (voxelManager, frames, callback) => {
    const arrayLength = voxelManager.getScalarDataLength();
    for (let j = 0; j < arrayLength; j++) {
      let sum = 0;
      for (const timepoint of frames) {
        sum += voxelManager.getAtIndexAndTimePoint(j, timepoint);
      }
      const average = sum / frames.length;
      callback(j, average);
    }
  },
};

/**
 * Generates an array of scalar data for a series of time frames from a 4D volume,
 * performing AVERAGE, SUM or SUBTRACT operations.
 *
 * @param dynamicVolume - volume to compute time frame data from
 * @param operation - operation to perform on time frame data, operations include
 * SUM, AVERAGE, and SUBTRACT (can only be used with 2 time frames provided)
 * @param options - additional options for the operation
 * @param options.frameNumbers - an array of frame indices to perform the operation on, if
 * left empty, all frames will be used
 * @returns {Float32Array} The resulting array after performing the operation
 * @throws {Error} If the operation is not supported or if invalid frame numbers are provided
 */
function generateImageFromTimeData(
  dynamicVolume: Types.IDynamicImageVolume,
  operation: Enums.GenerateImageType,
  options: {
    frameNumbers?: number[];
  }
): Float32Array {
  const { frameNumbers } = options;

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

  const resultArray = new Float32Array(arrayLength);
  operationFunction(voxelManager, frames, (index, value) => {
    resultArray[index] = value;
  });

  return resultArray;
}

/**
 * Updates the scalar data for a target volume based on a series of time frames
 * from a 4D volume, performing AVERAGE, SUM or SUBTRACT operations.
 *
 * @param dynamicVolume - volume to compute time frame data from
 * @param operation - operation to perform on time frame data, operations include
 * SUM, AVERAGE, and SUBTRACT (can only be used with 2 time frames provided)
 * @param options - additional options for the operation
 * @param options.frameNumbers - an array of frame indices to perform the operation on, if
 * left empty, all frames will be used
 * @param options.targetVolume - the volume to update with the result of the operation
 * @throws {Error} If no target volume is provided or if the operation is not supported
 */
function updateVolumeFromTimeData(
  dynamicVolume: Types.IDynamicImageVolume,
  operation: Enums.GenerateImageType,
  options: {
    frameNumbers?: number[];
    targetVolume: Types.IImageVolume;
  }
): void {
  const { frameNumbers, targetVolume } = options;

  if (!targetVolume) {
    throw new Error('A target volume must be provided');
  }

  const frames = frameNumbers || [...Array(dynamicVolume.numTimePoints).keys()];

  if (frames.length <= 1) {
    throw new Error('Please provide two or more time points');
  }

  const voxelManager = dynamicVolume.voxelManager;
  const targetVoxelManager = targetVolume.voxelManager;

  const operationFunction = operationFunctions[operation];

  if (!operationFunction) {
    throw new Error(`Unsupported operation: ${operation}`);
  }

  operationFunction(voxelManager, frames, (index, value) => {
    targetVoxelManager.setAtIndex(index, value);
  });

  // Update the modified slices in the target volume
  targetVoxelManager.resetModifiedSlices();
  for (let k = 0; k < targetVolume.dimensions[2]; k++) {
    targetVoxelManager.modifiedSlices.add(k);
  }
}

export { generateImageFromTimeData, updateVolumeFromTimeData };
