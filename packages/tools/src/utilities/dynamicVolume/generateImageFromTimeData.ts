import { Enums, Types } from '@cornerstonejs/core';

/**
 * Gets the scalar data for a series of time frames from a 4D volume, returns an
 * array of scalar data after performing AVERAGE, SUM or SUBTRACT to be used to
 * create a 3D volume
 *
 * @param dynamicVolume4D: volume to compute time frame data from
 * @param operation: operation to perform on time frame data, operations include
 * SUM, AVERAGE, and SUBTRACT (can only be used with 2 time frames provided)
 * @param frameNumbers: an array of frame indexs to perform the operation on, if
 * left empty, all frames will be used
 * @returns
 */
function generateImageFromTimeData(
  dynamicVolume: Types.IDynamicImageVolume,
  operation: string,
  frameNumbers?: number[]
) {
  // If no time frames provided, use all time frames
  const frames = frameNumbers || [...Array(dynamicVolume.numTimePoints).keys()];
  const numFrames = frames.length;

  if (frames.length <= 1) {
    throw new Error('Please provide two or more time points');
  }

  // Gets scalar data for all time frames
  const typedArrays = dynamicVolume.getScalarDataArrays();

  const arrayLength = typedArrays[0].length;
  const finalArray = new Float32Array(arrayLength);

  if (operation === Enums.DynamicOperatorType.SUM) {
    for (let i = 0; i < numFrames; i++) {
      const currentArray = typedArrays[frames[i]];
      for (let j = 0; j < arrayLength; j++) {
        finalArray[j] += currentArray[j];
      }
    }
    return finalArray;
  }

  if (operation === Enums.DynamicOperatorType.SUBTRACT) {
    if (frames.length > 2) {
      throw new Error('Please provide only 2 time points for subtraction.');
    }
    for (let j = 0; j < arrayLength; j++) {
      finalArray[j] += typedArrays[frames[0]][j] - typedArrays[frames[1]][j];
    }
    return finalArray;
  }

  if (operation === Enums.DynamicOperatorType.AVERAGE) {
    for (let i = 0; i < numFrames; i++) {
      const currentArray = typedArrays[frames[i]];
      for (let j = 0; j < arrayLength; j++) {
        finalArray[j] += currentArray[j];
      }
    }
    for (let k = 0; k < arrayLength; k++) {
      finalArray[k] = finalArray[k] / numFrames;
    }
    return finalArray;
  }
}

export default generateImageFromTimeData;
