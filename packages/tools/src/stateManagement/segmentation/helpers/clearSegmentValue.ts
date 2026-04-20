import { cache, utilities } from '@cornerstonejs/core';
import { getSegmentation } from '../getSegmentation';
import { triggerSegmentationDataModified } from '../triggerSegmentationEvents';
import { createLabelmapMemo } from '../../../utilities/segmentation/createLabelmapMemo';

const { DefaultHistoryMemo } = utilities.HistoryMemo;

/**
 * Clears the specified segment value from a segmentation.
 *
 * @param segmentationId - The unique identifier of the segmentation.
 * @param segmentIndex - The index of the segment to be cleared.
 * @param options - Optional. recordHistory: when true, record this clear in history. Caller must start group recording if grouping is desired.
 *
 * @throws {Error} If the segmentation type is not supported (currently only labelmap is supported).
 *
 * @remarks
 * This function iterates through all voxels in the segmentation and sets the value to 0
 * for any voxel that matches the specified segment index. It supports both stack and volume
 * segmentations.
 */
export function clearSegmentValue(
  segmentationId: string,
  segmentIndex: number,
  options?: { recordHistory?: boolean }
) {
  const segmentation = getSegmentation(segmentationId);

  if (segmentation.representationData.Labelmap) {
    const { representationData } = segmentation;
    const labelmapData = representationData.Labelmap;

    if ('imageIds' in labelmapData || 'volumeId' in labelmapData) {
      const items =
        'imageIds' in labelmapData
          ? labelmapData.imageIds.map((imageId) => cache.getImage(imageId))
          : [cache.getVolume(labelmapData.volumeId)];

      items.forEach((item) => {
        if (!item) {
          return;
        }

        const { voxelManager } = item;
        const memo = options?.recordHistory
          ? createLabelmapMemo(segmentationId, voxelManager)
          : null;
        const useVoxelManager = memo?.voxelManager ?? voxelManager;

        voxelManager.forEach(({ value, index }) => {
          if (value === segmentIndex) {
            useVoxelManager.setAtIndex(index, 0);
          }
        });

        if (memo?.commitMemo()) {
          DefaultHistoryMemo.push(memo);
        }
      });
    }

    triggerSegmentationDataModified(segmentationId);
  } else {
    throw new Error(
      'Invalid segmentation type, only labelmap is supported right now'
    );
  }
}
