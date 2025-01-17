import type { Types } from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/core';

/**
 * Helper function to sum scalar data over specified frames.
 */
function sumOverFrames(voxelManager, frames) {
  const arrayLength = voxelManager.getScalarDataLength();
  const resultArray = new Float32Array(arrayLength);

  for (const frameNumber of frames) {
    const scalarData = voxelManager.getFrameScalarData(frameNumber);
    for (let i = 0; i < arrayLength; i++) {
      resultArray[i] += scalarData[i];
    }
  }

  return resultArray;
}

/**
 * Helper function to average scalar data over specified frames.
 */
function averageOverFrames(voxelManager, frames) {
  const sumArray = sumOverFrames(voxelManager, frames);
  const numFrames = frames.length;

  for (let i = 0; i < sumArray.length; i++) {
    sumArray[i] /= numFrames;
  }

  return sumArray;
}

const operationFunctions = {
  [Enums.GenerateImageType.SUM]: (voxelManager, frames, callback) => {
    const resultArray = sumOverFrames(voxelManager, frames);
    for (let i = 0; i < resultArray.length; i++) {
      callback(i, resultArray[i]);
    }
  },

  [Enums.GenerateImageType.AVERAGE]: (voxelManager, frames, callback) => {
    const resultArray = averageOverFrames(voxelManager, frames);
    for (let i = 0; i < resultArray.length; i++) {
      callback(i, resultArray[i]);
    }
  },

  [Enums.GenerateImageType.SUBTRACT]: (voxelManager, frames, callback) => {
    if (frames.length !== 2) {
      throw new Error('Please provide only 2 frames for subtraction.');
    }

    const arrayLength = voxelManager.getScalarDataLength();
    const scalarData1 = voxelManager.getFrameScalarData(frames[0]);
    const scalarData2 = voxelManager.getFrameScalarData(frames[1]);

    for (let i = 0; i < arrayLength; i++) {
      const difference = scalarData1[i] - scalarData2[i];
      callback(i, difference);
    }
  },
};

/**
 * Generates an array of scalar data for a series of frames from a 4D volume,
 * performing AVERAGE, SUM or SUBTRACT operations.
 *
 * @param dynamicVolume - volume to compute frame data from
 * @param operation - operation to perform on frame data, operations include
 * SUM, AVERAGE, and SUBTRACT (can only be used with 2 frames provided)
 * @param options - additional options for the operation
 * @param options.frameNumbers - an array of frame numbers to perform the operation on (1-based),
 * if left empty, all frames will be used
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

  // Create array of frame numbers (1-based) if not provided
  const frames =
    frameNumbers ||
    Array.from({ length: dynamicVolume.numFrames }, (_, i) => i + 1);

  if (frames.length <= 1) {
    throw new Error('Please provide two or more frames');
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
 * Updates the scalar data for a target volume based on a series of frames
 * from a 4D volume, performing AVERAGE, SUM or SUBTRACT operations.
 *
 * @param dynamicVolume - volume to compute frame data from
 * @param operation - operation to perform on frame data, operations include
 * SUM, AVERAGE, and SUBTRACT (can only be used with 2 frames provided)
 * @param options - additional options for the operation
 * @param options.frameNumbers - an array of frame numbers to perform the operation on (1-based),
 * if left empty, all frames will be used
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

  // Create array of frame numbers (1-based) if not provided
  const frames =
    frameNumbers ||
    Array.from({ length: dynamicVolume.numFrames }, (_, i) => i + 1);

  if (frames.length <= 1) {
    throw new Error('Please provide two or more frames');
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
