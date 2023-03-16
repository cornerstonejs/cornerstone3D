import { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import { pointInShapeCallback } from '../../utilities';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import getBoundingBoxAroundShape from '../boundingBox/getBoundingBoxAroundShape';

export type ThresholdInformation = {
  volume: Types.IImageVolume;
  lower: number;
  upper: number;
};

// function used to compare to arrays
const equalsCheck = (a, b) => {
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * It thresholds a segmentation volume based on a set of threshold values with
 * respect to a list of volumes and respective threshold ranges.
 * @param segmentationVolume - the segmentation volume to be modified
 * @param segmentationIndex - the index of the segmentation to modify
 * @param thresholdVolumeInformation - array of objects containing volume data
 * and a range (lower and upper values) to threshold
 * @param overlapType - indicates if the user requires all voxels pass
 * (overlapType = 1) or any voxel pass (overlapType = 0)
 * @returns
 */
function thresholdSegmentationByRange(
  segmentationVolume: Types.IImageVolume,
  segmentationIndex: number,
  thresholdVolumeInformation: ThresholdInformation[],
  overlapType: number
): Types.IImageVolume {
  const { spacing: segmentationSpacing } = segmentationVolume;
  const scalarData = segmentationVolume.getScalarData();

  // prepare a list of volume information objects for callback functions
  const volumeInfoList = [];
  let baseVolumeIdx = 0;
  for (let i = 0; i < thresholdVolumeInformation.length; i++) {
    const { imageData, spacing, dimensions } =
      thresholdVolumeInformation[i].volume;

    const volumeSize =
      thresholdVolumeInformation[i].volume.getScalarData().length;
    // discover the index of the volume the segmentation data is based on
    if (
      volumeSize === scalarData.length &&
      equalsCheck(spacing, segmentationSpacing)
    ) {
      baseVolumeIdx = i;
    }

    // prepare information used in callback functions
    const referenceValues =
      thresholdVolumeInformation[i].volume.getScalarData();
    const lower = thresholdVolumeInformation[i].lower;
    const upper = thresholdVolumeInformation[i].upper;

    volumeInfoList.push({
      imageData,
      referenceValues,
      lower,
      upper,
      spacing,
      dimensions,
      volumeSize,
    });
  }

  // global variables used in calbackOverlap function
  let overlaps, total, range;

  /**
   * Given the center of a voxel in world coordinates, calculate the voxel
   * corners in world coords to calculate the voxel overlap in another volume
   */
  const getVoxelOverlap = (
    imageData,
    dimensions,
    voxelSpacing,
    voxelCenter
  ) => {
    const voxelCornersWorld = [];
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        for (let k = 0; k < 2; k++) {
          const point = voxelCenter;
          point[0] = point[0] + ((i * 2 - 1) * voxelSpacing[0]) / 2;
          point[1] = point[1] + ((j * 2 - 1) * voxelSpacing[1]) / 2;
          point[2] = point[2] + ((k * 2 - 1) * voxelSpacing[2]) / 2;
          voxelCornersWorld.push(point);
        }
      }
    }
    const voxelCornersIJK = voxelCornersWorld.map(
      (world) => csUtils.transformWorldToIndex(imageData, world) as Types.Point3
    );
    const overlapBounds = getBoundingBoxAroundShape(
      voxelCornersIJK,
      dimensions
    );

    return overlapBounds;
  };

  /**
   * This function will test all overlaps between a voxel in base volume
   * (the reference for segmentation volume creation) and voxels in other
   * volumes.
   * If the segmentation volume and the image volume are the same size,
   * checks if the scalar data at each point is within the threshold values.
   * If the segmentation volume and the image volume are different sizes,
   * checks the voxel overlap
   */

  for (let k = 0; k < volumeInfoList.length; k++) {
    const { imageData, referenceValues, lower, upper, dimensions } =
      volumeInfoList[k];
    if (volumeInfoList[k].volumeSize === scalarData.length) {
      for (let i = 0; i < scalarData.length; i++) {
        if (scalarData[i] === segmentationIndex) {
          const value = referenceValues[i];
          if (value >= lower && value <= upper) {
            scalarData[i] = segmentationIndex;
          } else {
            scalarData[i] = 0;
          }
        }
      }
    } else {
      for (let i = 0; i < scalarData.length; i++) {
        if (scalarData[i] === 1) {
          const overlapBounds = getVoxelOverlap(
            imageData,
            dimensions,
            volumeInfoList[baseVolumeIdx].spacing,
            volumeInfoList[baseVolumeIdx].imageData.getPoint(i)
          );

          const callbackOverlap = ({ value }) => {
            total = total + 1;
            if (value >= range.lower && value <= range.upper) {
              overlaps = overlaps + 1;
            }
          };

          total = 0;
          overlaps = 0;
          range = { lower, upper };
          let overlapTest = false;

          // check all voxel overlaps
          pointInShapeCallback(
            imageData,
            () => true,
            callbackOverlap,
            overlapBounds
          );

          if (overlapType === 0) {
            overlapTest = overlaps > 0; // any voxel overlap is accepted
          } else if (overlapType == 1) {
            overlapTest = overlaps === total; // require all voxel overlaps
          }

          if (overlapTest) {
            scalarData[i] = segmentationIndex;
          } else {
            scalarData[i] = 0;
          }
        }
      }
    }
  }

  triggerSegmentationDataModified(segmentationVolume.volumeId);

  return segmentationVolume;
}

export default thresholdSegmentationByRange;
