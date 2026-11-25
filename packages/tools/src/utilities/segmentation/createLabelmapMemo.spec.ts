import type { Types } from '@cornerstonejs/core';

jest.mock(
  '../../stateManagement/segmentation/triggerSegmentationEvents',
  () => ({
    triggerSegmentationDataModified: jest.fn(),
  })
);

import { createLabelmapMemo, memoAsStep } from './createLabelmapMemo';
import type { LabelmapMemo, LabelmapRestoreStep } from './createLabelmapMemo';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';

/**
 * A minimal segmentation voxel manager the RLE history voxel manager can wrap:
 * dimensions [n, 1, 1] so index === pointIJK[0].
 */
function createSourceVoxelManager(values: number[]) {
  const state = { values: [...values] };
  const voxelManager = {
    id: 'source',
    dimensions: [values.length, 1, 1] as Types.Point3,
    getAtIndex: (index: number) => state.values[index],
    setAtIndex: (index: number, value: number) => {
      state.values[index] = value;
    },
    getAtIJKPoint: ([i]: Types.Point3) => state.values[i],
    setAtIJKPoint: ([i]: Types.Point3, value: number) => {
      state.values[i] = value;
    },
    get values() {
      return [...state.values];
    },
  };
  return voxelManager as unknown as Types.IVoxelManager<number> & {
    values: number[];
  };
}

function createOrderedStep(
  label: string,
  order: string[]
): LabelmapRestoreStep {
  return {
    undo: () => order.push(`${label}.undo`),
    redo: () => order.push(`${label}.redo`),
  };
}

describe('createLabelmapMemo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('without overlap (plain single-layer stroke)', () => {
    it('round-trips a stroke through undo and redo', () => {
      const source = createSourceVoxelManager([0, 0, 2, 0]);
      const memo = createLabelmapMemo(
        'segmentation',
        source
      ) as unknown as LabelmapMemo;

      // The stroke writes through the memo's history voxel manager, exactly
      // like the brush strategies do.
      memo.voxelManager.setAtIndex(0, 1);
      memo.voxelManager.setAtIndex(2, 1);
      expect(source.values).toEqual([1, 0, 1, 0]);

      expect(memo.commitMemo()).toBe(true);

      memo.restoreMemo(true);
      expect(source.values).toEqual([0, 0, 2, 0]);

      memo.restoreMemo(false);
      expect(source.values).toEqual([1, 0, 1, 0]);

      // undo/redo must stay stable across repeated cycles
      memo.restoreMemo(true);
      expect(source.values).toEqual([0, 0, 2, 0]);
      memo.restoreMemo(false);
      expect(source.values).toEqual([1, 0, 1, 0]);

      expect(triggerSegmentationDataModified).toHaveBeenCalledWith(
        'segmentation',
        expect.any(Array)
      );
    });

    it('does not commit a stroke that changed nothing', () => {
      const source = createSourceVoxelManager([0, 1, 0]);
      const memo = createLabelmapMemo(
        'segmentation',
        source
      ) as unknown as LabelmapMemo;

      // writing the value that is already there is a no-op
      memo.voxelManager.setAtIndex(1, 1);

      expect(memo.commitMemo()).toBe(false);
    });

    it('stays committed once committed', () => {
      const source = createSourceVoxelManager([0]);
      const memo = createLabelmapMemo(
        'segmentation',
        source
      ) as unknown as LabelmapMemo;

      memo.voxelManager.setAtIndex(0, 1);
      expect(memo.commitMemo()).toBe(true);
      expect(memo.commitMemo()).toBe(true);
    });
  });

  describe('with overlap (steps riding on the stroke memo)', () => {
    it('commits a memo that only recorded steps', () => {
      const source = createSourceVoxelManager([0]);
      const memo = createLabelmapMemo(
        'segmentation',
        source
      ) as unknown as LabelmapMemo;
      const order: string[] = [];

      memo.priorSteps = [createOrderedStep('segmentMove', order)];

      expect(memo.commitMemo()).toBe(true);

      // A steps-only memo must restore without its own undo/redo voxel
      // managers.
      memo.restoreMemo(true);
      expect(order).toEqual(['segmentMove.undo']);
      memo.restoreMemo(false);
      expect(order).toEqual(['segmentMove.undo', 'segmentMove.redo']);
    });

    it('restores steps in reverse-chronological order on undo and chronological order on redo', () => {
      const source = createSourceVoxelManager([0, 0]);
      const memo = createLabelmapMemo(
        'segmentation',
        source
      ) as unknown as LabelmapMemo;
      const order: string[] = [];

      // one voxel write so the own-voxel restore is a single, observable call
      memo.voxelManager.setAtIndex(0, 1);

      memo.priorSteps = [
        createOrderedStep('earlierMemo', order),
        createOrderedStep('segmentMove', order),
      ];
      memo.postSteps = [createOrderedStep('crossLayerErase', order)];

      expect(memo.commitMemo()).toBe(true);

      const originalSetAtIJKPoint = source.setAtIJKPoint;
      source.setAtIJKPoint = (point, value) => {
        order.push('ownVoxels');
        return originalSetAtIJKPoint(point, value);
      };

      memo.restoreMemo(true);
      expect(order).toEqual([
        'crossLayerErase.undo',
        'ownVoxels',
        'segmentMove.undo',
        'earlierMemo.undo',
      ]);

      order.length = 0;
      memo.restoreMemo(false);
      expect(order).toEqual([
        'earlierMemo.redo',
        'segmentMove.redo',
        'ownVoxels',
        'crossLayerErase.redo',
      ]);
    });

    it('memoAsStep replays the wrapped memo', () => {
      const source = createSourceVoxelManager([0]);
      const memo = createLabelmapMemo(
        'segmentation',
        source
      ) as unknown as LabelmapMemo;

      memo.voxelManager.setAtIndex(0, 3);
      expect(memo.commitMemo()).toBe(true);

      const step = memoAsStep(memo);

      step.undo();
      expect(source.values).toEqual([0]);
      step.redo();
      expect(source.values).toEqual([3]);
    });
  });
});
