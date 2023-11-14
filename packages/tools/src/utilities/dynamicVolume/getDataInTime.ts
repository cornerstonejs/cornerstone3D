import { utilities, cache, Types } from '@cornerstonejs/core';
import { getVoxelOverlap } from '../segmentation/utilities';
import pointInShapeCallback from '../pointInShapeCallback';

/**
 * Gets the scalar data for a series of time points for either a single
 * coordinate or a segmentation mask, it will return the an array of scalar
 * data for a single coordinate or an array of arrays for a segmentation.
 *
 * @param dynamicVolume - 4D volume to compute time point data from
 * @param options - frameNumbers: which frames to use as timepoints, if left
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
    throw new Error(
      'You should provide either maskVolumeId or imageCoordinate'
    );
  }

  if (options.maskVolumeId && options.imageCoordinate) {
    throw new Error('You can only use one of maskVolumeId or imageCoordinate');
  }

  if (options.maskVolumeId) {
    const segmentationVolume = cache.getVolume(options.maskVolumeId);

    const [dataInTime, ijkCoords] = _getTimePointDataMask(
      frames,
      dynamicVolume,
      segmentationVolume
    );

    return [dataInTime, ijkCoords];
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

function _getTimePointDataMask(frames, dynamicVolume, segmentationVolume) {
  const { imageData: maskImageData } = segmentationVolume;
  const segScalarData = segmentationVolume.getScalarData();

  const len = segScalarData.length;

  // Pre-allocate memory for array
  const nonZeroVoxelIndices = [];
  nonZeroVoxelIndices.length = len;
  const ijkCoords = [];

  const dimensions = segmentationVolume.dimensions;

  // Get the index of every non-zero voxel in mask
  let actualLen = 0;
  for (let i = 0, len = segScalarData.length; i < len; i++) {
    if (segScalarData[i] !== 0) {
      ijkCoords.push([
        i % dimensions[0],
        Math.floor((i / dimensions[0]) % dimensions[1]),
        Math.floor(i / (dimensions[0] * dimensions[1])),
      ]);
      nonZeroVoxelIndices[actualLen++] = i;
    }
  }

  // Trim the array to actual size
  nonZeroVoxelIndices.length = actualLen;

  const dynamicVolumeScalarDataArray = dynamicVolume.getScalarDataArrays();
  const values = [];
  const isSameVolume =
    dynamicVolumeScalarDataArray[0].length === len &&
    JSON.stringify(dynamicVolume.spacing) ===
      JSON.stringify(segmentationVolume.spacing);

  // if the segmentation mask is the same size as the dynamic volume (one frame)
  // means we can just return the scalar data for the non-zero voxels
  if (isSameVolume) {
    for (let i = 0; i < nonZeroVoxelIndices.length; i++) {
      const indexValues = [];
      frames.forEach((frame) => {
        const activeScalarData = dynamicVolumeScalarDataArray[frame];
        indexValues.push(activeScalarData[nonZeroVoxelIndices[i]]);
      });
      values.push(indexValues);
    }

    return [values, ijkCoords];
  }

  // In case that the segmentation mask is not the same size as the dynamic volume (one frame)
  // then we need to consider each voxel in the segmentation mask and check if it
  // overlaps with the other volume, and if so we need to average the values of the
  // overlapping voxels.
  const callback = ({
    pointLPS: segPointLPS,
    value: segValue,
    pointIJK: segPointIJK,
  }) => {
    // see if the value is non-zero
    if (segValue === 0) {
      // not interested
      return;
    }

    // Then for each non-zero voxel in the segmentation mask, we should
    // again perform the pointInShapeCallback to run the averaging callback
    // function to get the average value of the overlapping voxels.
    const overlapIJKMinMax = getVoxelOverlap(
      dynamicVolume.imageData,
      dynamicVolume.dimensions,
      dynamicVolume.spacing,
      segPointLPS
    );

    // count represents the number of voxels of the dynamic volume that represents
    // one voxel of the segmentation mask
    let count = 0;
    const perFrameSum = new Map();

    // Pre-initialize the Map
    frames.forEach((frame) => perFrameSum.set(frame, 0));

    const averageCallback = ({ index }) => {
      for (let i = 0; i < frames.length; i++) {
        const value = dynamicVolumeScalarDataArray[i][index];
        const frame = frames[i];
        perFrameSum.set(frame, perFrameSum.get(frame) + value);
      }
      count++;
    };

    pointInShapeCallback(
      dynamicVolume.imageData,
      () => true,
      averageCallback,
      overlapIJKMinMax
    );

    // average the values
    const averageValues = [];
    perFrameSum.forEach((sum) => {
      averageValues.push(sum / count);
    });

    ijkCoords.push(segPointIJK);
    values.push(averageValues);
  };

  // Since we have the non-zero voxel indices of the segmentation mask,
  // we theoretically can use them, however, we kind of need to compute the
  // pointLPS for each of the non-zero voxel indices, which is a bit of a pain.
  // Todo: consider using the nonZeroVoxelIndices to compute the pointLPS
  pointInShapeCallback(maskImageData, () => true, callback);

  return [values, ijkCoords];
}

export default getDataInTime;
