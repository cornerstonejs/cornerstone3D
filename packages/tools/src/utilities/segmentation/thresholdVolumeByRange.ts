import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import { pointInShapeCallback } from '../../utilities';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import { BoundsIJK } from '../../types';
import getBoundingBoxAroundShape from '../boundingBox/getBoundingBoxAroundShape';

export type ThresholdRangeOptions = {
  overwrite: boolean;
  boundsIJK: BoundsIJK;
  coverType: number;
};

export type ThresholdInformation = {
  volume: Types.IImageVolume;
  lower: number;
  upper: number;
};

/**
 * It thresholds a segmentation volume based on a set of threshold values with
 * respect to reference volumes.
 * @param segmentationVolume - the segmentation volume to be modified
 * @param referenceVolumes - the reference volumes to be used for thresholding
 * @param options - the options for thresholding
 * @returns segmented volume
 */
function thresholdVolumeByRange(
  segmentationVolume: Types.IImageVolume,
  thresholdVolumeInformation: ThresholdInformation[],
  options: ThresholdRangeOptions
): Types.IImageVolume {
  const { scalarData, imageData: segmentationImageData } = segmentationVolume;

  const { overwrite, boundsIJK, coverType } = options;

  // set the segmentation to all zeros
  if (overwrite) {
    for (let i = 0; i < scalarData.length; i++) {
      scalarData[i] = 0;
    }
  }

  const volumeInfoList = [];
  let baseVolumeIdx = 0;
  for (let i = 0; i < thresholdVolumeInformation.length; i++) {
    const { imageData, spacing, dimensions } =
      thresholdVolumeInformation[i].volume;
    const referenceValues = imageData.getPointData().getScalars().getData();
    const lower = thresholdVolumeInformation[i].lower;
    const upper = thresholdVolumeInformation[i].upper;
    // discover the volume Index the segmentation data is based on
    if (
      thresholdVolumeInformation[i].volume.scalarData.length ===
      scalarData.length
    )
      baseVolumeIdx = i;

    volumeInfoList.push({
      imageData,
      referenceValues,
      lower,
      upper,
      spacing,
      dimensions,
    });
  }

  let hits, total;
  let range;

  // this callback function will test voxels in the finer volume and counts
  // which pass the range test
  const callbackFinerVolume = ({ value }) => {
    total = total + 1;
    if (value >= range.lower && value <= range.upper) {
      hits = hits + 1;
    }
  };

  const callback = ({ index, pointLPS }) => {
    let insert = volumeInfoList.length > 0;
    for (let i = 0; i < volumeInfoList.length; i++) {
      // if this is the volume were is based the segmentation, test the voxels
      if (i == baseVolumeIdx) {
        const { imageData, referenceValues, lower, upper } = volumeInfoList[i];
        const pointIJK = imageData.worldToIndex(pointLPS);
        const offset = imageData.computeOffsetIndex(pointIJK);

        const value = referenceValues[offset];
        if (value <= lower || value >= upper) insert = false;
        if (!insert) {
          break;
        }
      } else {
        // if it is a finer volume, need to test all its voxels that correspond
        // to the voxel in base volume
        const { imageData, dimensions, lower, upper, spacing } =
          volumeInfoList[i];
        const pointsToUse = [];
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            for (let k = 0; k < 2; k++) {
              const point = pointLPS;
              point[0] = point[0] + (i * 2 - 1) * spacing[0];
              point[1] = point[1] + (i * 2 - 1) * spacing[1];
              point[2] = point[2] + (i * 2 - 1) * spacing[2];
              pointsToUse.push(point);
            }
          }
        }

        const rectangleCornersIJK = pointsToUse.map(
          (world) =>
            csUtils.transformWorldToIndex(imageData, world) as Types.Point3
        );
        const boundsIJK = getBoundingBoxAroundShape(
          rectangleCornersIJK,
          dimensions
        );
        total = 0;
        hits = 0;
        range = { lower, upper };
        pointInShapeCallback(
          imageData,
          () => true,
          callbackFinerVolume,
          boundsIJK
        );
        // any voxel will do
        if (coverType === 0) {
          insert = hits > 0;
        } else if (coverType == 1) {
          // all voxels needed
          insert = hits === total;
        }
        if (!insert) break;
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
