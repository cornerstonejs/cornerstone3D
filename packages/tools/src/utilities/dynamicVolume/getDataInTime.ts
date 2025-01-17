import type { Types } from '@cornerstonejs/core';
import { utilities, cache } from '@cornerstonejs/core';
import { getVoxelOverlap } from '../segmentation/utilities';

/**
 * Gets the scalar data for a series of frames for either a single
 * coordinate or a segmentation mask, it will return the an array of scalar
 * data for a single coordinate or an array of arrays for a segmentation.
 *
 * @param dynamicVolume - 4D volume to compute frame data from
 * @param options - frameNumbers: which frames to use (1-based), if left
 * blank, gets data over all frames
 *        Note: frameNumber starts at 1 in 4D DICOM specification
 * maskVolumeId: segmentationId to get frame data of
 * worldCoordinate: world coordinate to get frame data of
 * @returns
 */
function getDataInTime(
  dynamicVolume: Types.IDynamicImageVolume,
  options: {
    frameNumbers?;
    maskVolumeId?;
    worldCoordinate?;
  }
): number[] | number[][] {
  let dataInTime;

  // if frameNumbers is not provided, all frames are selected (1-based)
  const frames =
    options.frameNumbers ||
    Array.from({ length: dynamicVolume.numFrames }, (_, i) => i + 1);

  // You only need to provide either maskVolumeId OR worldCoordinate.
  // Throws error if neither maskVolumeId or worldCoordinate is given,
  // throws error if BOTH maskVolumeId and worldCoordinate is given
  if (!options.maskVolumeId && !options.worldCoordinate) {
    throw new Error(
      'You should provide either maskVolumeId or imageCoordinate'
    );
  }

  if (options.maskVolumeId && options.worldCoordinate) {
    throw new Error('You can only use one of maskVolumeId or imageCoordinate');
  }

  if (options.maskVolumeId) {
    const segmentationVolume = cache.getVolume(options.maskVolumeId);

    if (!segmentationVolume) {
      throw new Error('Segmentation volume not found');
    }

    const [dataInTime, ijkCoords] = _getFrameDataMask(
      frames,
      dynamicVolume,
      segmentationVolume
    );

    return [dataInTime, ijkCoords];
  }

  if (options.worldCoordinate) {
    const dataInTime = _getFrameDataCoordinate(
      frames,
      options.worldCoordinate,
      dynamicVolume
    );

    return dataInTime;
  }

  return dataInTime;
}

function _getFrameDataCoordinate(frames, coordinate, volume) {
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
  const value = [];

  frames.forEach((frameNumber) => {
    const scalarIndex = index[2] * zMultiple + index[1] * yMultiple + index[0];
    value.push(
      volume.voxelManager.getAtIndexAndFrame(scalarIndex, frameNumber)
    );
  });

  return value;
}

function _getFrameDataMask(frames, dynamicVolume, segmentationVolume) {
  const { imageData: maskImageData } = segmentationVolume;
  const segVoxelManager = segmentationVolume.voxelManager;

  const scalarDataLength = segVoxelManager.getScalarDataLength();

  // Pre-allocate memory for array
  const nonZeroVoxelIndices = [];
  nonZeroVoxelIndices.length = scalarDataLength;

  // Get the index of every non-zero voxel in mask
  let actualLen = 0;
  for (let i = 0, len = scalarDataLength; i < len; i++) {
    if (segVoxelManager.getAtIndex(i) !== 0) {
      nonZeroVoxelIndices[actualLen++] = i;
    }
  }

  // Trim the array to actual size
  nonZeroVoxelIndices.length = actualLen;

  const nonZeroVoxelValuesInTime = [];
  const isSameVolume =
    dynamicVolume.voxelManager.getScalarDataLength() === scalarDataLength &&
    JSON.stringify(dynamicVolume.spacing) ===
      JSON.stringify(segmentationVolume.spacing);

  const ijkCoords = [];

  // if the segmentation mask is the same size as the dynamic volume (one frame)
  // means we can just return the scalar data for the non-zero voxels
  if (isSameVolume) {
    for (let i = 0; i < nonZeroVoxelIndices.length; i++) {
      const valuesInTime = [];
      const index = nonZeroVoxelIndices[i];
      for (let j = 0; j < frames.length; j++) {
        valuesInTime.push(
          dynamicVolume.voxelManager.getAtIndexAndFrame(index, frames[j])
        );
      }
      nonZeroVoxelValuesInTime.push(valuesInTime);
      ijkCoords.push(segVoxelManager.toIJK(index));
    }

    return [nonZeroVoxelValuesInTime, ijkCoords];
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
    frames.forEach((frameNumber) => perFrameSum.set(frameNumber, 0));

    const averageCallback = ({ index }) => {
      for (let i = 0; i < frames.length; i++) {
        const value = dynamicVolume.voxelManager.getAtIndexAndFrame(
          index,
          frames[i]
        );
        const frameNumber = frames[i];
        perFrameSum.set(frameNumber, perFrameSum.get(frameNumber) + value);
      }
      count++;
    };

    dynamicVolume.voxelManager.forEach(averageCallback, {
      imageData: dynamicVolume.imageData,
      boundsIJK: overlapIJKMinMax,
    });

    // average the values
    const averageValues = [];
    perFrameSum.forEach((sum) => {
      averageValues.push(sum / count);
    });

    ijkCoords.push(segPointIJK);
    nonZeroVoxelValuesInTime.push(averageValues);
  };

  // Since we have the non-zero voxel indices of the segmentation mask,
  // we theoretically can use them, however, we kind of need to compute the
  // pointLPS for each of the non-zero voxel indices, which is a bit of a pain.
  // Todo: consider using the nonZeroVoxelIndices to compute the pointLPS
  segmentationVolume.voxelManager.forEach(callback, {
    imageData: maskImageData,
  });

  return [nonZeroVoxelValuesInTime, ijkCoords];
}

export default getDataInTime;
