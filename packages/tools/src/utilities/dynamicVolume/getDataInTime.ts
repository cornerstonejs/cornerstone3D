import { utilities, cache } from '@cornerstonejs/core';

/**
 *
 * @param dynamicVolume: 4D volume to compute time point data from
 * @param options: frameNumbers: which frames to us as timepoints, if left
 * blank, gets data timepoints over all frames
 * maskVolumeId: segmentationId to get timepoint data of
 * imageCoordinate: image coordinate to get timepoint data of
 * @returns
 */
function getDataInTime(
  // dynamicVolumeId: string,
  dynamicVolume: any,
  options: {
    frameNumbers?;
    maskVolumeId?;
    imageCoordinate?;
  }
): number[] | number[][] {
  let frames;
  let dataInTime;

  // if frameNumbers is not provided, all frames are selected
  if (!options.frameNumbers) {
    frames = [...Array(dynamicVolume.numTimePoints).keys()];
  } else {
    frames = options.frameNumbers;
  }

  // Throws error if neither maskVolumeId or imageCoordinate is given,
  // throws error if BOTH maskVolumeId and imageCoordinate is given
  if (!options.maskVolumeId && !options.imageCoordinate) {
    throw new Error('No ROI provided');
  } else if (options.maskVolumeId && options.imageCoordinate) {
    throw new Error('Please provide only one ROI');
  } else if (options.maskVolumeId && !options.imageCoordinate) {
    const segmentationVolume = cache.getVolume(options.maskVolumeId);

    // Get the index of every non-zero voxel in mask by mapping indexes to
    // new array, then using the array to filter
    const is = segmentationVolume.getScalarData().map((_, i) => i);
    const indexArray = is.filter(
      (i) => segmentationVolume.getScalarData[i] != 0
    );
    const dataInTime = _getTimePointDataMask(frames, indexArray, dynamicVolume);

    return dataInTime;
  } else if (options.imageCoordinate && !options.maskVolumeId) {
    const dataInTime = _getTimePointDataCoordinate(
      frames,
      options.imageCoordinate,
      dynamicVolume
    );

    return dataInTime;
  }

  return dataInTime;
}

function _getTimePointDataCoordinate(frames, coordinate, volume) {
  const { dimensions, imageData } = volume;
  const index = imageData.worldToIndex(coordinate);

  index[0] = Math.floor(index[0]);
  index[1] = Math.floor(index[1]);
  index[2] = Math.floor(index[2]);

  if (!utilities.indexWithinDimensions(index, dimensions)) {
    throw new Error('outside bounds');
  }

  // calculate offset for index
  const yMultiple = dimensions[0];
  const zMultiple = dimensions[0] * dimensions[1];
  const allScalarData = volume.getScalarDataArrays();
  const value = [];

  for (let i = frames[0]; i < frames[0] + frames.length; i++) {
    const activeScalarData = allScalarData[i];
    const scalarIndex = index[2] * zMultiple + index[1] * yMultiple + index[0];
    value.push(activeScalarData[scalarIndex]);
  }

  return value;
}

function _getTimePointDataMask(frames, indexArray, volume) {
  const allScalarData = volume.getScalarDataArrays();
  const value = [];

  for (let i = 0; i < indexArray.length; i++) {
    const indexValues = [];
    for (let i = frames[0]; i < frames[0] + frames.length; i++) {
      const activeScalarData = allScalarData[i];
      indexValues.push(activeScalarData[indexArray[i]]);
    }
    value.push([indexValues]);
  }
  return value;
}

export default getDataInTime;
