import { utilities } from '@cornerstonejs/core';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import type { Types } from '@cornerstonejs/core';

const { VoxelManager, RLEVoxelMap } = utilities;

/**
 * The labelmap memo state, extending from the base Memo state
 */
export type LabelmapMemo = Types.Memo & {
  /** The base segmentation voxel manager */
  segmentationVoxelManager: Types.IVoxelManager<number>;
  /** The history remembering voxel manager */
  voxelManager: Types.IVoxelManager<number>;
  /** The redo and undo voxel managers */
  redoVoxelManager?: Types.IVoxelManager<number>;
  undoVoxelManager?: Types.IVoxelManager<number>;
  memo?: LabelmapMemo;
  /** A unique identifier for this memo */
  id: string;
};

/**
 * Creates a labelmap memo instance.  Does not push it to the
 * stack, which is handled externally.
 */
export function createLabelmapMemo<T>(
  segmentationId: string,
  segmentationVoxelManager: Types.IVoxelManager<T>
) {
  return createRleMemo(segmentationId, segmentationVoxelManager);
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
  const slices = useVoxelManager.getArrayOfModifiedSlices();
  triggerSegmentationDataModified(this.segmentationId, slices);

  // Event dispatch moved to historyMemo/index.ts
}

/**
 * Creates an RLE memo state that stores additional changes to the voxel
 * map.
 */
export function createRleMemo<T>(
  segmentationId: string,
  segmentationVoxelManager: Types.IVoxelManager<T>
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
    id: utilities.uuidv4(),
    operationType: 'labelmap',
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
  // @ts-expect-error
  RLEVoxelMap.copyMap(undoVoxelManager.map, this.voxelManager.map);
  for (const key of this.voxelManager.modifiedSlices.keys()) {
    undoVoxelManager.modifiedSlices.add(key);
  }
  this.undoVoxelManager = undoVoxelManager;
  const redoVoxelManager = VoxelManager.createRLEVolumeVoxelManager({
    dimensions: this.segmentationVoxelManager.dimensions,
  });
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
