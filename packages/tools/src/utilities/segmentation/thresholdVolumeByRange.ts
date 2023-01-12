import { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import { pointInShapeCallback } from '../../utilities';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import { BoundsIJK } from '../../types';
import getBoundingBoxAroundShape from '../boundingBox/getBoundingBoxAroundShape';

export type ThresholdRangeOptions = {
  overwrite: boolean;
  boundsIJK: BoundsIJK;
  overlapType?: number;
};

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
 * @param thresholdVolumeInformation - array of objects containing volume data
 * and a range (lower and upper values) to threshold
 * @param options - the options for thresholding
 * As there is a chance the volumes might have different dimensions and spacing,
 * could be the case of no 1 to 1 mapping. So we need to work with the idea of
 * voxel overlaps (1 to many mappings). We consider all intersections valid, to
 * avoid thecomplexity to calculate a minimum voxel intersection percentage.
 * This function, given a voxel center and spacing, calculates the overlap of
 * the voxel with another volume and range check the voxels in the overlap.
 * Three situations can occur: all voxels pass the range check, some voxels pass
 * or none voxels pass. The overlapType parameter indicates if the user requires
 * all voxels pass (overlapType = 1) or any voxel pass (overlapType = 0)
 *
 * @returns segmented volume
 */
function thresholdVolumeByRange(
  segmentationVolume: Types.IImageVolume,
  thresholdVolumeInformation: ThresholdInformation[],
  options: ThresholdRangeOptions
): Types.IImageVolume {
  const {
    scalarData,
    spacing: segmentationSpacing,
    imageData: segmentationImageData,
  } = segmentationVolume;

  const { overwrite, boundsIJK } = options;
  const overlapType = options?.overlapType || 0;

  // set the segmentation to all zeros
  if (overwrite) {
    for (let i = 0; i < scalarData.length; i++) {
      scalarData[i] = 0;
    }
  }

  // prepare a list of volume information objects for callback functions
  const volumeInfoList = [];
  let baseVolumeIdx = 0;
  for (let i = 0; i < thresholdVolumeInformation.length; i++) {
    const { imageData, spacing, dimensions } =
      thresholdVolumeInformation[i].volume;

    const volumeSize = thresholdVolumeInformation[i].volume.scalarData.length;
    // discover the index of the volume the segmentation data is based on
    if (
      volumeSize === scalarData.length &&
      equalsCheck(spacing, segmentationSpacing)
    ) {
      baseVolumeIdx = i;
    }

    // prepare information used in callback functions
    const referenceValues = imageData.getPointData().getScalars().getData();
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

  const testOverlapRange = (volumeInfo, voxelSpacing, voxelCenter) => {
    /**
     * This callback function will test all overlaps between a voxel in base
     * volume (the reference for segmentation volume creation) and voxels in other
     * volumes.
     */
    const callbackOverlap = ({ value }) => {
      total = total + 1;
      if (value >= range.lower && value <= range.upper) {
        overlaps = overlaps + 1;
      }
    };

    const { imageData, dimensions, lower, upper } = volumeInfo;

    const overlapBounds = getVoxelOverlap(
      imageData,
      dimensions,
      voxelSpacing,
      voxelCenter
    );

    // reset global variables and setting the range check
    total = 0;
    overlaps = 0;
    range = { lower, upper };

    let overlapTest = false;

    // check all voxel overlaps
    pointInShapeCallback(imageData, () => true, callbackOverlap, overlapBounds);

    if (overlapType === 0) {
      overlapTest = overlaps > 0; // any voxel overlap is accepted
    } else if (overlapType == 1) {
      overlapTest = overlaps === total; // require all voxel overlaps
    }
    return overlapTest;
  };

  // range checks a voxel in a volume with same dimension as the segmentation
  const testRange = (volumeInfo, pointIJK) => {
    const { imageData, referenceValues, lower, upper } = volumeInfo;
    const offset = imageData.computeOffsetIndex(pointIJK);

    const value = referenceValues[offset];
    if (value <= lower || value >= upper) {
      return false;
    } else {
      return true;
    }
  };

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
   * This callback function will test all overlaps between a voxel in base
   * volume (the reference for segmentation volume creation) and voxels in other
   * volumes.
   */
  const callback = ({ index, pointIJK, pointLPS }) => {
    let insert = volumeInfoList.length > 0;
    for (let i = 0; i < volumeInfoList.length; i++) {
      // if volume has the same size as segmentation volume, just range check
      if (volumeInfoList[i].volumeSize === scalarData.length) {
        insert = testRange(volumeInfoList[i], pointIJK);
      } else {
        // if not, need to calculate overlaps
        insert = testOverlapRange(
          volumeInfoList[i],
          volumeInfoList[baseVolumeIdx].spacing,
          pointLPS
        );
      }
      if (!insert) {
        break;
      }
    }

    // Todo: make the segmentIndex a parameter
    if (insert) scalarData[index] = 1;
  };

  pointInShapeCallback(segmentationImageData, () => true, callback, boundsIJK);

  triggerSegmentationDataModified(segmentationVolume.volumeId);

  return segmentationVolume;
}

export default thresholdVolumeByRange;
