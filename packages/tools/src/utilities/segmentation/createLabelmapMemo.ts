import { utilities } from '@cornerstonejs/core';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import type { Types } from '@cornerstonejs/core';

const { VoxelManager, RLEVoxelMap } = utilities;

/**
 * A side effect of a stroke that is not captured by the memo's own history
 * voxel manager: cross-layer erases, a segment moving to a private
 * labelmap layer (layer registration + binding change + bulk voxel move), or a
 * committed sibling memo from before a mid-stroke voxel-manager swap. Steps
 * make the whole stroke restorable as one undo/redo unit.
 */
export type LabelmapRestoreStep = {
  undo: () => void;
  redo: () => void;
};

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
  /**
   * Steps that happened chronologically BEFORE this memo's voxel writes
   * (earlier same-stroke memo on another layer, a segment move to a
   * private layer).
   */
  priorSteps?: LabelmapRestoreStep[];
  /**
   * Steps that happened chronologically AFTER/DURING this memo's voxel writes
   * (cross-layer overwrite erases).
   */
  postSteps?: LabelmapRestoreStep[];
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
 * Wraps a committed memo so it can ride along as a step of another memo (used
 * when a stroke's target voxel manager swaps mid-stroke, e.g. a segment moves
 * to a private labelmap layer part-way through a drag).
 */
export function memoAsStep(memo: LabelmapMemo): LabelmapRestoreStep {
  return {
    undo: () => memo.restoreMemo(true),
    redo: () => memo.restoreMemo(false),
  };
}

/**
 * A restore memo function.  This restores the memo's own voxel changes plus
 * any recorded steps, in reverse-chronological order for undo and
 * chronological order for redo, so a stroke that moved a segment across
 * layers or erased other layers restores as one consistent unit.
 */
export function restoreMemo(isUndo?: boolean) {
  const undo = isUndo !== false;
  const priorSteps: LabelmapRestoreStep[] = this.priorSteps ?? [];
  const postSteps: LabelmapRestoreStep[] = this.postSteps ?? [];

  const restoreVoxelChanges = () => {
    const { segmentationVoxelManager, undoVoxelManager, redoVoxelManager } =
      this;
    const useVoxelManager = undo ? undoVoxelManager : redoVoxelManager;
    if (!useVoxelManager) {
      // Steps-only memo (no voxel writes of its own)
      return;
    }
    useVoxelManager.forEach(({ value, pointIJK }) => {
      segmentationVoxelManager.setAtIJKPoint(pointIJK, value);
    });
    const slices = useVoxelManager.getArrayOfModifiedSlices();
    triggerSegmentationDataModified(this.segmentationId, slices);
  };

  if (undo) {
    for (let i = postSteps.length - 1; i >= 0; i--) {
      postSteps[i].undo();
    }
    restoreVoxelChanges();
    for (let i = priorSteps.length - 1; i >= 0; i--) {
      priorSteps[i].undo();
    }
  } else {
    for (const step of priorSteps) {
      step.redo();
    }
    restoreVoxelChanges();
    for (const step of postSteps) {
      step.redo();
    }
  }

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
  const hasSteps = !!(this.priorSteps?.length || this.postSteps?.length);
  if (!this.voxelManager.modifiedSlices.size) {
    // No voxel writes of its own, but recorded steps still make this memo
    // worth keeping on the history ring.
    return hasSteps;
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
