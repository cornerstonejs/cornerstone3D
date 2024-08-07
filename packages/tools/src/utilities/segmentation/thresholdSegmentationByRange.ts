import { Types } from '@cornerstonejs/core';
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
  // prepare a list of volume information objects for callback functions
  const { baseVolumeIdx, volumeInfoList } = processVolumes(
    segmentationVolume,
    thresholdVolumeInformation
  );

  const baseVolume = volumeInfoList[baseVolumeIdx];
  const refImageData = baseVolume.imageData;
  const refVoxelManager = baseVolume.volume.voxelManager;

  const scalarDataLength =
    segmentationVolume.voxelManager.getScalarDataLength();

  const segVoxelManager = segmentationVolume.voxelManager;

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

    if (volumeSize === scalarDataLength) {
      _handleSameSizeVolume(
        segVoxelManager,
        refVoxelManager,
        segmentationIndex,
        volumeInfo
      );
    } else {
      _handleDifferentSizeVolume(
        segVoxelManager,
        refVoxelManager,
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
  segVoxelManager,
  refVoxelManager,
  segmentationIndex: number,
  volumeInfo: any,
  volumeInfoList: any,
  baseVolumeIdx: number,
  overlapType: number
) {
  const { imageData, lower, upper, dimensions } = volumeInfo;

  let total, overlaps, range;

  const segScalarDataLength = segVoxelManager.getScalarDataLength();

  for (let i = 0; i < segScalarDataLength; i++) {
    if (segScalarDataLength.getAtIndex(i) === segmentationIndex) {
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
      segVoxelManager.forEach(callbackOverlap, {
        imageData,
        boundsIJK: overlapBounds,
      });

      overlapTest = overlapType === 0 ? overlaps > 0 : overlaps === total;
      segVoxelManager.setAtIndex(i, overlapTest ? segmentationIndex : 0);
    }
  }
  return { total, range, overlaps };
}

function _handleSameSizeVolume(
  segVoxelManager,
  refVoxelManager,
  segmentationIndex: number,
  volumeInfo: any
) {
  const { lower, upper } = volumeInfo;
  const scalarDataLength = segVoxelManager.getScalarDataLength();

  for (let i = 0; i < scalarDataLength; i++) {
    if (segVoxelManager.getAtIndex[i] === segmentationIndex) {
      const value = refVoxelManager.getAtIndex(i);
      segVoxelManager.setAtIndex(
        i,
        value >= lower && value <= upper ? segmentationIndex : 0
      );
    }
  }
}

export default thresholdSegmentationByRange;
