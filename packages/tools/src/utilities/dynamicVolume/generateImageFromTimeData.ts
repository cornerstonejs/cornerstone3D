import type { Types } from '@cornerstonejs/core';
import { Enums } from '@cornerstonejs/core';

/**
 * Helper function to sum scalar data over specified dimension groups.
 */
function sumOverDimensionGroups(voxelManager, dimensionGroups) {
  const arrayLength = voxelManager.getScalarDataLength();
  const resultArray = new Float32Array(arrayLength);

  for (const dimensionGroupNumber of dimensionGroups) {
    const scalarData =
      voxelManager.getDimensionGroupScalarData(dimensionGroupNumber);
    for (let i = 0; i < arrayLength; i++) {
      resultArray[i] += scalarData[i];
    }
  }

  return resultArray;
}

/**
 * Helper function to average scalar data over specified dimension groups.
 */
function averageOverDimensionGroups(voxelManager, dimensionGroups) {
  const sumArray = sumOverDimensionGroups(voxelManager, dimensionGroups);
  const numDimensionGroups = dimensionGroups.length;

  for (let i = 0; i < sumArray.length; i++) {
    sumArray[i] /= numDimensionGroups;
  }

  return sumArray;
}

const operationFunctions = {
  [Enums.GenerateImageType.SUM]: (voxelManager, dimensionGroups, callback) => {
    const resultArray = sumOverDimensionGroups(voxelManager, dimensionGroups);
    for (let i = 0; i < resultArray.length; i++) {
      callback(i, resultArray[i]);
    }
  },

  [Enums.GenerateImageType.AVERAGE]: (
    voxelManager,
    dimensionGroups,
    callback
  ) => {
    const resultArray = averageOverDimensionGroups(
      voxelManager,
      dimensionGroups
    );
    for (let i = 0; i < resultArray.length; i++) {
      callback(i, resultArray[i]);
    }
  },

  [Enums.GenerateImageType.SUBTRACT]: (
    voxelManager,
    dimensionGroups,
    callback
  ) => {
    if (dimensionGroups.length !== 2) {
      throw new Error(
        'Please provide only 2 dimension groups for subtraction.'
      );
    }

    const arrayLength = voxelManager.getScalarDataLength();
    const scalarData1 = voxelManager.getDimensionGroupScalarData(
      dimensionGroups[0]
    );
    const scalarData2 = voxelManager.getDimensionGroupScalarData(
      dimensionGroups[1]
    );

    for (let i = 0; i < arrayLength; i++) {
      const difference = scalarData1[i] - scalarData2[i];
      callback(i, difference);
    }
  },
};

/**
 * Generates an array of scalar data for a series of dimension groups from a 4D volume,
 * performing AVERAGE, SUM or SUBTRACT operations.
 *
 * @param dynamicVolume - volume to compute dimension group data from
 * @param operation - operation to perform on dimension group data, operations include
 * SUM, AVERAGE, and SUBTRACT (can only be used with 2 dimension groups provided)
 * @param options - additional options for the operation
 * @param options.dimensionGroupNumbers - an array of dimension group numbers to perform the operation on (1-based),
 * if left empty, all dimension groups will be used
 * @param options.frameNumbers - @deprecated Use dimensionGroupNumbers instead
 * @returns {Float32Array} The resulting array after performing the operation
 * @throws {Error} If the operation is not supported or if invalid dimension group numbers are provided
 */
function generateImageFromTimeData(
  dynamicVolume: Types.IDynamicImageVolume,
  operation: Enums.GenerateImageType,
  options: {
    dimensionGroupNumbers?: number[];
    frameNumbers?: number[];
  }
): Float32Array {
  const { dimensionGroupNumbers, frameNumbers } = options;

  if (frameNumbers) {
    console.warn(
      'Warning: frameNumbers parameter is deprecated. Please use dimensionGroupNumbers instead.'
    );
  }

  // Create array of dimension group numbers (1-based) if not provided
  const dimensionGroups =
    dimensionGroupNumbers ||
    frameNumbers ||
    Array.from({ length: dynamicVolume.numDimensionGroups }, (_, i) => i + 1);

  if (dimensionGroups.length <= 1) {
    throw new Error('Please provide two or more dimension groups');
  }

  const voxelManager = dynamicVolume.voxelManager;
  const arrayLength = voxelManager.getScalarDataLength();

  const operationFunction = operationFunctions[operation];

  if (!operationFunction) {
    throw new Error(`Unsupported operation: ${operation}`);
  }

  const resultArray = new Float32Array(arrayLength);
  operationFunction(voxelManager, dimensionGroups, (index, value) => {
    resultArray[index] = value;
  });

  return resultArray;
}

/**
 * Updates the scalar data for a target volume based on a series of dimension groups
 * from a 4D volume, performing AVERAGE, SUM or SUBTRACT operations.
 *
 * @param dynamicVolume - volume to compute dimension group data from
 * @param operation - operation to perform on dimension group data, operations include
 * SUM, AVERAGE, and SUBTRACT (can only be used with 2 dimension groups provided)
 * @param options - additional options for the operation
 * @param options.dimensionGroupNumbers - an array of dimension group numbers to perform the operation on (1-based),
 * if left empty, all dimension groups will be used
 * @param options.frameNumbers - @deprecated Use dimensionGroupNumbers instead
 * @param options.targetVolume - the volume to update with the result of the operation
 * @throws {Error} If no target volume is provided or if the operation is not supported
 */
function updateVolumeFromTimeData(
  dynamicVolume: Types.IDynamicImageVolume,
  operation: Enums.GenerateImageType,
  options: {
    dimensionGroupNumbers?: number[];
    frameNumbers?: number[];
    targetVolume: Types.IImageVolume;
  }
): void {
  const { dimensionGroupNumbers, frameNumbers, targetVolume } = options;

  if (!targetVolume) {
    throw new Error('A target volume must be provided');
  }

  if (frameNumbers) {
    console.warn(
      'Warning: frameNumbers parameter is deprecated. Please use dimensionGroupNumbers instead.'
    );
  }

  // Create array of dimension group numbers (1-based) if not provided
  const dimensionGroups =
    dimensionGroupNumbers ||
    frameNumbers ||
    Array.from({ length: dynamicVolume.numDimensionGroups }, (_, i) => i + 1);

  if (dimensionGroups.length <= 1) {
    throw new Error('Please provide two or more dimension groups');
  }

  const voxelManager = dynamicVolume.voxelManager;
  const targetVoxelManager = targetVolume.voxelManager;

  const operationFunction = operationFunctions[operation];

  if (!operationFunction) {
    throw new Error(`Unsupported operation: ${operation}`);
  }

  operationFunction(voxelManager, dimensionGroups, (index, value) => {
    targetVoxelManager.setAtIndex(index, value);
  });

  // Update the modified slices in the target volume
  targetVoxelManager.resetModifiedSlices();
  for (let k = 0; k < targetVolume.dimensions[2]; k++) {
    targetVoxelManager.modifiedSlices.add(k);
  }
}

export { generateImageFromTimeData, updateVolumeFromTimeData };
