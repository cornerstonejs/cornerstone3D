import { utilities } from '@cornerstonejs/core';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import type { Types } from '@cornerstonejs/core';
import { InitializedOperationData } from '../../tools/segmentation/strategies/BrushStrategy';

const { VoxelManager, RLEVoxelMap } = utilities;

/**
 * The labelmap memo state, extending from the base Memo state
 */
export type LabelmapMemo = Types.Memo & {
  /** The base segmentation voxel manager */
  segmentationVoxelManager: Types.VoxelManager<number>;
  /** The history remembering voxel manager */
  voxelManager: Types.VoxelManager<number>;
  /** The redo and undo voxel managers */
  redoVoxelManager?: Types.VoxelManager<number>;
  undoVoxelManager?: Types.VoxelManager<number>;
  memo?: LabelmapMemo;
};

/**
 * Creates a labelmap memo instance.  Does not push it to the
 * stack, which is handled externally.
 */
export function createLabelmapMemo<T>(
  segmentationId: string,
  segmentationVoxelManager: Types.VoxelManager<T>,
  preview?: InitializedOperationData
) {
  return preview
    ? createPreviewMemo(segmentationId, preview)
    : createRleMemo(segmentationId, segmentationVoxelManager);
}

/**
 * A restore memo function.  This simply copies either the redo or the base
 * voxel manager data to the segmentation state and triggers segmentation data
 * modified.
 */
export function restoreMemo(isUndo?: boolean) {
  const { segmentationVoxelManager, undoVoxelManager, redoVoxelManager } = this;
  const useVoxelManager =
    isUndo === false ? redoVoxelManager : undoVoxelManager;
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
    commitMemo,
    segmentationVoxelManager,
    voxelManager,
  };
  return state;
}

/**
 * Creates a preview memo.
 */
export function createPreviewMemo(
  segmentationId: string,
  preview: InitializedOperationData
) {
  const {
    memo: previewMemo,
    segmentationVoxelManager,
    previewVoxelManager,
  } = preview;

  const state = {
    segmentationId,
    restoreMemo,
    commitMemo,
    segmentationVoxelManager,
    voxelManager: previewVoxelManager,
    memo: previewMemo,
    preview,
  };
  return state;
}

/**
 * This is a member function of a memo that causes the completion of the
 * storage - that is, it copies the RLE data and creates a reverse RLE map
 */
function commitMemo() {
  if (this.redoVoxelManager) {
    return true;
  }
  if (!this.voxelManager.modifiedSlices.size) {
    return false;
  }
  const { segmentationVoxelManager } = this;
  const undoVoxelManager = VoxelManager.createRLEHistoryVoxelManager(
    segmentationVoxelManager
  );
  RLEVoxelMap.copyMap(
    undoVoxelManager.map as Types.RLEVoxelMap<unknown>,
    this.voxelManager.map
  );
  for (const key of this.voxelManager.modifiedSlices.keys()) {
    undoVoxelManager.modifiedSlices.add(key);
  }
  this.undoVoxelManager = undoVoxelManager;
  const redoVoxelManager = VoxelManager.createRLEVoxelManager(
    this.segmentationVoxelManager.dimensions
  );
  this.redoVoxelManager = redoVoxelManager;
  undoVoxelManager.forEach(({ index, pointIJK, value }) => {
    const currentValue = segmentationVoxelManager.getAtIJKPoint(pointIJK);
    if (currentValue === value) {
      return;
    }
    redoVoxelManager.setAtIndex(index, currentValue);
  });
  return true;
}
