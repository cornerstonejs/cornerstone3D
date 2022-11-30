import type { Types } from '@cornerstonejs/core';

import { pointInShapeCallback } from '../../utilities';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import { BoundsIJK } from '../../types';

export type ThresholdRangeOptions = {
  upper: number;
  lower: number;
  boundsIJK: BoundsIJK;
  overwrite: boolean;
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
  referenceVolumes: Types.IImageVolume[],
  options: ThresholdRangeOptions[],
  boundsIJK: any
): Types.IImageVolume {
  const { scalarData, imageData: segmentationImageData } = segmentationVolume;
  const { overwrite } = options[0];

  // set the segmentation to all zeros
  if (overwrite) {
    for (let i = 0; i < scalarData.length; i++) {
      scalarData[i] = 0;
    }
  }

  const volumeInfoList = [];
  for (let i = 0; i < referenceVolumes.length; i++) {
    const { imageData } = referenceVolumes[i];
    const referenceValues = imageData.getPointData().getScalars().getData();
    const { lower, upper } = options[i];
    const volumeInfo = {
      imageData,
      referenceValues,
      lower,
      upper,
    };
    volumeInfoList.push(volumeInfo);
  }

  const callback = ({ index, pointIJK }) => {
    let insert = volumeInfoList.length > 0;
    for (let i = 0; i < volumeInfoList.length; i++) {
      const { imageData, referenceValues, lower, upper } = volumeInfoList[i];
      const offset = imageData.computeOffsetIndex(pointIJK);
      const value = referenceValues[offset];
      if (value <= lower || value >= upper) insert = false;
      if (!insert) break;
    }

    // Todo: make the segmentIndex a parameter
    if (insert) scalarData[index] = 1;
  };

  pointInShapeCallback(segmentationImageData, () => true, callback, boundsIJK);

  triggerSegmentationDataModified(segmentationVolume.volumeId);

  return segmentationVolume;
}

export default thresholdVolumeByRange;
