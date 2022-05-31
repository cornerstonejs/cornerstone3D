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
  referenceVolume: Types.IImageVolume,
  options: ThresholdRangeOptions
): Types.IImageVolume {
  const { scalarData, imageData: segmentationImageData } = segmentationVolume;
  const { overwrite, boundsIJK, upper, lower } = options;

  const { imageData } = referenceVolume;
  const referenceValues = imageData.getPointData().getScalars().getData();

  // set the segmentation to all zeros
  if (overwrite) {
    for (let i = 0; i < scalarData.length; i++) {
      scalarData[i] = 0;
    }
  }

  const callback = ({ index, pointIJK }) => {
    const offset = imageData.computeOffsetIndex(pointIJK);
    const value = referenceValues[offset];
    if (value <= lower || value >= upper) {
      return;
    }

    // Todo: make the segmentIndex a parameter
    scalarData[index] = 1;
  };

  pointInShapeCallback(segmentationImageData, () => true, callback, boundsIJK);

  triggerSegmentationDataModified(segmentationVolume.volumeId);

  return segmentationVolume;
}

export default thresholdVolumeByRange;
