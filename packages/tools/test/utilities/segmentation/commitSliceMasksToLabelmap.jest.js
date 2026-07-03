import { describe, it, expect } from '@jest/globals';
import { utilities } from '@cornerstonejs/core';
import { commitSliceMasksToLabelmapVolume } from '../../../src/utilities/segmentation/commitSliceMasksToLabelmap';
import { FLOOD_SLICE_FLAG_VISITED } from '../../../src/utilities/segmentation/floodFillSliceLazy';

const { VoxelManager } = utilities;

const W = 8;
const H = 8;
const D = 3;

function makeLabelmap() {
  const scalarData = new Uint8Array(W * H * D);
  const voxelManager = VoxelManager.createScalarVolumeVoxelManager({
    dimensions: [W, H, D],
    scalarData,
  });
  return {
    labelmapVolume: { voxelManager, dimensions: [W, H, D], imageIds: [] },
    voxelManager,
    scalarData,
  };
}

function makeMask(points) {
  const flags = new Uint8Array(W * H);
  for (const [x, y] of points) {
    flags[y * W + x] |= FLOOD_SLICE_FLAG_VISITED;
  }
  return flags;
}

describe('commitSliceMasksToLabelmapVolume history recording', () => {
  it('paints the labelmap without a history manager (baseline)', () => {
    const { labelmapVolume, voxelManager } = makeLabelmap();
    const sliceMasks = new Map([
      [
        1,
        makeMask([
          [2, 2],
          [3, 2],
        ]),
      ],
    ]);

    const { voxelCount } = commitSliceMasksToLabelmapVolume({
      labelmapVolume,
      sliceMasks,
      width: W,
      height: H,
      paintIndex: 255,
    });

    expect(voxelCount).toBe(2);
    expect(voxelManager.getAtIJK(2, 2, 1)).toBe(255);
    expect(voxelManager.getAtIJK(3, 2, 1)).toBe(255);
  });

  it('records original values through a history voxel manager so undo restores them', () => {
    const { labelmapVolume, voxelManager } = makeLabelmap();
    // Pre-existing segment data that the fill will overwrite.
    voxelManager.setAtIJK(2, 2, 1, 7);

    const historyVoxelManager =
      VoxelManager.createRLEHistoryVoxelManager(voxelManager);

    const sliceMasks = new Map([
      [
        1,
        makeMask([
          [2, 2],
          [3, 2],
          [4, 2],
        ]),
      ],
    ]);
    const { voxelCount } = commitSliceMasksToLabelmapVolume({
      labelmapVolume,
      sliceMasks,
      width: W,
      height: H,
      paintIndex: 255,
      historyVoxelManager,
    });

    // Writes went through to the labelmap...
    expect(voxelCount).toBe(3);
    expect(voxelManager.getAtIJK(2, 2, 1)).toBe(255);
    expect(voxelManager.getAtIJK(3, 2, 1)).toBe(255);
    expect(voxelManager.getAtIJK(4, 2, 1)).toBe(255);
    // ...and the history layer knows which slices changed.
    expect(historyVoxelManager.modifiedSlices.size).toBeGreaterThan(0);

    // Undo = write the recorded original values back (what restoreMemo does).
    historyVoxelManager.forEach(({ value, pointIJK }) => {
      voxelManager.setAtIJKPoint(pointIJK, value);
    });

    expect(voxelManager.getAtIJK(2, 2, 1)).toBe(7); // pre-existing restored
    expect(voxelManager.getAtIJK(3, 2, 1)).toBe(0);
    expect(voxelManager.getAtIJK(4, 2, 1)).toBe(0);
  });
});
