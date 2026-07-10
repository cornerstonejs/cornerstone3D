import { describe, it, expect } from '@jest/globals';
import { floodFill3dSliceLazy } from '../../../src/utilities/segmentation/floodFillSliceLazy';

const SIZE = 40;

// Uniform volume: every voxel matches, so an unbounded flood fills everything.
const getter = (_x, _y, _z) => 1;
const equals = (val) => val === 1;

describe('floodFill3dSliceLazy budget and shape gate', () => {
  it('fills completely when unconstrained and reports the bounding box', async () => {
    const result = await floodFill3dSliceLazy(getter, [20, 20, 1], {
      width: SIZE,
      height: SIZE,
      depth: 3,
      equals,
      yieldEvery: 0,
    });
    expect(result.truncated).toBe(false);
    expect(result.voxelCount).toBe(SIZE * SIZE * 3);
    expect(result.bbox).toEqual({
      min: [0, 0, 0],
      max: [SIZE - 1, SIZE - 1, 2],
    });
  });

  it('stops and flags truncated when the compute budget is exceeded', async () => {
    const result = await floodFill3dSliceLazy(getter, [20, 20, 1], {
      width: SIZE,
      height: SIZE,
      depth: 3,
      equals,
      yieldEvery: 0,
      maxVoxels: 500,
    });
    expect(result.truncated).toBe(true);
    // It stops promptly after crossing the budget, well short of a full fill.
    expect(result.voxelCount).toBeLessThan(SIZE * SIZE * 3);
  });

  it('stops when shouldContinue rejects the growing region', async () => {
    const seenStats = [];
    const result = await floodFill3dSliceLazy(getter, [20, 20, 1], {
      width: SIZE,
      height: SIZE,
      depth: 3,
      equals,
      yieldEvery: 0,
      validateEvery: 256,
      shouldContinue: (stats) => {
        seenStats.push(stats);
        return stats.voxelCount < 1000;
      },
    });
    expect(result.truncated).toBe(true);
    expect(result.voxelCount).toBeLessThan(SIZE * SIZE * 3);
    expect(seenStats.length).toBeGreaterThan(0);
    // Stats carry a live bounding box for shape checks.
    expect(seenStats[0].bbox.min.length).toBe(3);
    expect(seenStats[0].bbox.max.length).toBe(3);
  });

  it('loads slices through ensureSliceLoaded before reading from them', async () => {
    // Voxels read as unloaded (undefined) until ensureSliceLoaded marks their
    // slice; the fill must request every slice it visits.
    const loaded = new Set();
    const result = await floodFill3dSliceLazy(
      (_x, _y, z) => (loaded.has(z) ? 1 : undefined),
      [20, 20, 1],
      {
        width: SIZE,
        height: SIZE,
        depth: 3,
        equals,
        yieldEvery: 0,
        maxDeltaIJ: 0,
        ensureSliceLoaded: async (z) => {
          loaded.add(z);
        },
      }
    );

    expect(result.truncated).toBe(false);
    // A 1x1 column through all three slices: the seed plus its two through-
    // slice neighbors, each only readable after its slice was loaded.
    expect(result.voxelCount).toBe(3);
    expect([...loaded].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('does not truncate a region that ends on its own within the budget', async () => {
    // Planar 5x5 region bounded by maxDeltaIJ.
    const result = await floodFill3dSliceLazy(getter, [20, 20, 1], {
      width: SIZE,
      height: SIZE,
      depth: 3,
      equals,
      yieldEvery: 0,
      planar: true,
      maxDeltaIJ: 2,
      maxVoxels: 25,
      shouldContinue: () => true,
    });
    expect(result.truncated).toBe(false);
    expect(result.voxelCount).toBe(25);
    expect(result.bbox).toEqual({
      min: [18, 18, 1],
      max: [22, 22, 1],
    });
  });
});
