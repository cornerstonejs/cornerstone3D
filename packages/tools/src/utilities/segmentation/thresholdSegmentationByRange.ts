import { Types } from '@cornerstonejs/core';
import { pointInShapeCallback } from '../../utilities';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import {
  getVoxelOverlap,
  processVolumes,
  ThresholdInformation,
} from './utilities';

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
  const scalarData = segmentationVolume.getScalarData();

  // prepare a list of volume information objects for callback functions
  const { baseVolumeIdx, volumeInfoList } = processVolumes(
    segmentationVolume,
    thresholdVolumeInformation
  );

  /**
   * This function will test all overlaps between a voxel in base volume
   * (the reference for segmentation volume creation) and voxels in other
   * volumes.
   * If the segmentation volume and the image volume are the same size,
   * checks if the scalar data at each point is within the threshold values.
   * If the segmentation volume and the image volume are different sizes,
   * checks the voxel overlap
   */
  volumeInfoList.forEach((volumeInfo) => {
    const { volumeSize } = volumeInfo;

    if (volumeSize === scalarData.length) {
      _handleSameSizeVolume(scalarData, segmentationIndex, volumeInfo);
    } else {
      _handleDifferentSizeVolume(
        scalarData,
        segmentationIndex,
        volumeInfo,
        volumeInfoList,
        baseVolumeIdx,
        overlapType
      );
    }
  });

  triggerSegmentationDataModified(segmentationVolume.volumeId);

  return segmentationVolume;
}

function _handleDifferentSizeVolume(
  scalarData: Types.VolumeScalarData,
  segmentationIndex: number,
  volumeInfo: any,
  volumeInfoList: any,
  baseVolumeIdx: number,
  overlapType: number
) {
  const { imageData, lower, upper, dimensions } = volumeInfo;

  let total, overlaps, range;

  for (let i = 0; i < scalarData.length; i++) {
    if (scalarData[i] === segmentationIndex) {
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

      overlapTest = overlapType === 0 ? overlaps > 0 : overlaps === total;
      scalarData[i] = overlapTest ? segmentationIndex : 0;
    }
  }
  return { total, range, overlaps };
}

function _handleSameSizeVolume(
  scalarData: Types.VolumeScalarData,
  segmentationIndex: number,
  volumeInfo: any
) {
  const { referenceValues, lower, upper } = volumeInfo;

  for (let i = 0; i < scalarData.length; i++) {
    if (scalarData[i] === segmentationIndex) {
      const value = referenceValues[i];
      scalarData[i] = value >= lower && value <= upper ? segmentationIndex : 0;
    }
  }
}

export default thresholdSegmentationByRange;
