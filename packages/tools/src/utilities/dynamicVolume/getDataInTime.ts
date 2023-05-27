import { utilities, cache, Types } from '@cornerstonejs/core';

/**
 * Gets the scalar data for a series of time points for either a single
 * coordinate or a segmentation mask, it will return the an array of scalar
 * data for a single coordinate or an array of arrays for a segmentation.
 *
 * @param dynamicVolume: 4D volume to compute time point data from
 * @param options: frameNumbers: which frames to use as timepoints, if left
 * blank, gets data timepoints over all frames
 * maskVolumeId: segmentationId to get timepoint data of
 * imageCoordinate: world coordinate to get timepoint data of
 * @returns
 */
function getDataInTime(
  dynamicVolume: Types.IDynamicImageVolume,
  options: {
    frameNumbers?;
    maskVolumeId?;
    imageCoordinate?;
  }
): number[] | number[][] {
  let dataInTime;

  // if frameNumbers is not provided, all frames are selected
  const frames = options.frameNumbers || [
    ...Array(dynamicVolume.numTimePoints).keys(),
  ];

  // You only need to provide either maskVolumeId OR imageCoordinate.
  // Throws error if neither maskVolumeId or imageCoordinate is given,
  // throws error if BOTH maskVolumeId and imageCoordinate is given
  if (!options.maskVolumeId && !options.imageCoordinate) {
    throw new Error('No ROI provided');
  }

  if (options.maskVolumeId && options.imageCoordinate) {
    throw new Error('Please provide only one ROI');
  }

  if (options.maskVolumeId) {
    const segmentationVolume = cache.getVolume(options.maskVolumeId);

    // Get the index of every non-zero voxel in mask by mapping indexes to
    // new array, then using the array to filter
    const indexArray = segmentationVolume
      .getScalarData()
      .map((_, i) => i)
      .filter((i) => segmentationVolume.getScalarData()[i] !== 0);
    const dataInTime = _getTimePointDataMask(frames, indexArray, dynamicVolume);

    return dataInTime;
  }

  if (options.imageCoordinate) {
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

  frames.forEach((frame) => {
    const activeScalarData = allScalarData[frame];
    const scalarIndex = index[2] * zMultiple + index[1] * yMultiple + index[0];
    value.push(activeScalarData[scalarIndex]);
  });

  return value;
}

function _getTimePointDataMask(frames, indexArray, volume) {
  const allScalarData = volume.getScalarDataArrays();
  const value = [];

  for (let i = 0; i < indexArray.length; i++) {
    const indexValues = [];
    frames.forEach((frame) => {
      const activeScalarData = allScalarData[frame];
      indexValues.push(activeScalarData[indexArray[i]]);
    });
    value.push(indexValues);
  }
  return value;
}

export default getDataInTime;
