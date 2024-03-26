import { utilities } from '@cornerstonejs/core';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import type { Types } from '@cornerstonejs/core';

const { VoxelManager, RLEVoxelMap } = utilities;

/**
 * The labelmap memo state.
 */
export type LabelmapMemo = Types.Memo & {
  setValue: (pointIJK: Types.Point3, value) => void;
  segmentationVoxelManager: Types.VoxelManager<unknown>;
  voxelManager: Types.VoxelManager<unknown>;
  // Copy the data for completion
  complete: () => void;
  memo?: LabelmapMemo;
};

/**
 * Creates a labelmap memo instance.  Does not push it to the
 * stack, which is handled externally.
 */
export function createLabelmapMemo<T>(
  segmentationId: string,
  segmentationVoxelManager: Types.VoxelManager<T>,
  previewVoxelManager?: Types.VoxelManager<T>,
  previewMemo?: LabelmapMemo
) {
  return previewVoxelManager
    ? createPreviewMemo(
        segmentationId,
        segmentationVoxelManager,
        previewVoxelManager,
        previewMemo
      )
    : createRleMemo(segmentationId, segmentationVoxelManager);
}

/**
 * A restore memo function.  This simply copies either the redo or the base
 * voxel manager data to the segmentation state and triggers segmentation data
 * modified.
 */
export function restoreMemo(isUndo?: boolean) {
  this.complete?.();
  const { segmentationVoxelManager, voxelManager, redoVoxelManager } = this;
  const useVoxelManager = isUndo === false ? redoVoxelManager : voxelManager;
  useVoxelManager.forEach(({ value, pointIJK }) => {
    segmentationVoxelManager.setAtIJKPoint(pointIJK, value);
  });
  const slices = useVoxelManager.getArrayOfSlices();
  triggerSegmentationDataModified(this.segmentationId, slices);
}

/**
 * Creates an RLE memo state that stores additional changes to the voxel
 * map.
 */
export function createRleMemo<T>(
  segmentationId: string,
  segmentationVoxelManager: Types.VoxelManager<T>
) {
  const voxelManager = VoxelManager.createRLEHistoryVoxelManager(
    segmentationVoxelManager
  );
  const state = {
    segmentationId,
    restoreMemo,
    complete,
    segmentationVoxelManager,
    voxelManager,
  };
  return state;
}

export function createPreviewMemo<T>(
  segmentationId: string,
  segmentationVoxelManager: Types.VoxelManager<T>,
  previewVoxelManager: Types.VoxelManager<T>,
  previewMemo
) {
  previewMemo?.complete();

  const state = {
    segmentationId,
    restoreMemo,
    complete,
    segmentationVoxelManager,
    voxelManager: previewVoxelManager,
    memo: previewMemo,
  };
  return state;
}

/**
 * This is a member function of a memo that causes the completion of the
 * storage - that is, it copies the RLE data and creates a reverse RLE map
 */
function complete() {
  this.complete = null;
  const { segmentationVoxelManager } = this;
  const cloneVoxelManager = VoxelManager.createRLEHistoryVoxelManager(
    segmentationVoxelManager
  );
  RLEVoxelMap.copyMap(
    cloneVoxelManager.map as Types.RLEVoxelMap<unknown>,
    this.voxelManager.map
  );
  for (const key of this.voxelManager.modifiedSlices.keys()) {
    cloneVoxelManager.modifiedSlices.add(key);
  }
  this.voxelManager = cloneVoxelManager;
  const redoVoxelManager = VoxelManager.createRLEVoxelManager(
    this.segmentationVoxelManager.dimensions
  );
  this.redoVoxelManager = redoVoxelManager;
  cloneVoxelManager.forEach(({ index, pointIJK, value }) => {
    const currentValue = segmentationVoxelManager.getAtIJKPoint(pointIJK);
    if (!currentValue || currentValue === value) {
      return;
    }
    redoVoxelManager.setAtIndex(index, currentValue);
  });
}
