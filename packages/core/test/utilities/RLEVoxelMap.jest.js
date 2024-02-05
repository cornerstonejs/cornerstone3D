import { VoxelManager } from '../../src/utilities';
import RLEVoxelMap from '../../src/utilities/RLEVoxelMap';
import { describe, it, expect } from '@jest/globals';

const size = [64, 128, 4];

const ijkPoint = [4, 2, 2];
const rleMap = new RLEVoxelMap(64, 128, 4);
const voxelMap = VoxelManager.createLazyVoxelManager(size);

describe('RLEVoxelMap', () => {
  it('storesValues', () => {
    rleMap.set(voxelMap.toIndex(ijkPoint), 1);
    expect(rleMap.get(voxelMap.toIndex(ijkPoint))).toBe(1);
  });

  it('generatesRuns', () => {
    const index = voxelMap.toIndex(ijkPoint);
    const endIndex = voxelMap.toIndex([64, 2, 2]);
    for (let i = index; i < endIndex; i++) {
      rleMap.set(i, 1);
    }
    const run = rleMap.getRun(2, 2);
    expect(run).not.toBeUndefined();
    expect(run.value).toBe(1);
    expect(run.i).toBe(4);
    expect(run.iEnd).toBe(64);
    expect(run.run).toBeNull();
    expect(rleMap.getRun(3, 2)).toBeUndefined();
    expect(rleMap.getRun(2, 3)).toBeUndefined();
    expect(rleMap.getRun(1, 2)).toBeUndefined();
    expect(rleMap.getRun(2, 1)).toBeUndefined();
  });

  it('allowsMultipleValues', () => {
    const j = 16;
    const baseIndex = voxelMap.toIndex([0, j, 0]);
    for (let i = 16; i <= 32; i++) {
      const value = (Math.floor((i - 16) / 2) % 2) + 1;
      rleMap.set(i + baseIndex, value);
    }
    const run = rleMap.getRun(j, 0);
    expect(run.value).toBe(1);
    expect(run.i).toBe(16);
    expect(run.iEnd).toBe(18);
    const run2 = run.run;
    expect(run2.value).toBe(2);
    expect(run2.i).toBe(18);
    expect(run2.iEnd).toBe(20);
  });

  describe('RLEVoxelManager', () => {
    it('sets', () => {
      const map = VoxelManager.createRLEVoxelManager(size);
      map.setAtIJK(...ijkPoint, 15);
      expect(map.getAtIJK(...ijkPoint)).toBe(15);
      expect(map.getAtIJKPoint(ijkPoint)).toBe(15);
      expect(map.getAtIndex(map.toIndex(ijkPoint))).toBe(15);
    });
  });
});

//
