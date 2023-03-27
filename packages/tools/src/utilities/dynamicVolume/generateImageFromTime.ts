import { utilities, cache, Types } from '@cornerstonejs/core';
import getDataInTime from './getDataInTime';

function generateImageFromTime(
  dynamicVolume: Types.IDynamicImageVolume,
  operation: string,
  options: {
    frameNumbers?;
    maskVolumeId?;
    imageCoordinate?;
  } = {}
) {
  const frames = options.frameNumbers || [
    ...Array(dynamicVolume.numTimePoints).keys(),
  ];
  const numFrames = frames.length;

  if (frames.length <= 1) {
    throw new Error('Please provide two or more time points');
  }

  const typedArrays = dynamicVolume.getScalarDataArrays();

  const arrayLength = typedArrays[0].length;
  const finalArray = new Float32Array(arrayLength);

  if (operation === 'SUM') {
    for (let i = 0; i < numFrames; i++) {
      const currentArray = typedArrays[frames[i]];
      for (let j = 0; j < arrayLength; j++) {
        finalArray[j] += currentArray[j];
      }
    }
  }

  if (operation === 'SUBTRACT') {
    if (frames.length > 2) {
      throw new Error('Please provide only 2 time points for subtraction.');
    }
    for (let j = 0; j < arrayLength; j++) {
      finalArray[j] += typedArrays[0][j] - typedArrays[1][j];
    }
  }

  if (operation === 'AVERAGE') {
    for (let i = 0; i < numFrames; i++) {
      const currentArray = typedArrays[frames[i]];
      for (let j = 0; j < arrayLength; j++) {
        finalArray[j] += currentArray[j];
      }
    }
    for (let k = 0; k < arrayLength; k++) {
      finalArray[k] = finalArray[k] / numFrames;
    }
  }

  return finalArray;
}

export default generateImageFromTime;
