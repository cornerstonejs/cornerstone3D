import { VoxelManager } from '../../src/utilities';
import RLEVoxelMap from '../../src/utilities/RLEVoxelMap';
import { describe, it, expect, beforeEach } from '@jest/globals';

const size = [64, 128, 4];

const ijkPoint = [4, 2, 2];
const rleMap = new RLEVoxelMap(64, 128, 4);
const voxelMap = VoxelManager.createLazyVoxelManager(size);

const j = 4;
const baseIndex = j * 64;
const i = 2;

describe('RLEVoxelMap', () => {
  beforeEach(() => {
    rleMap.clear();
  });

  let row;
  function setupRLE(indices, value = 1) {
    for (const index of indices) {
      rleMap.set(index + baseIndex, value);
    }
    for (const index of indices) {
      expect(rleMap.get(index + baseIndex)).toBe(value);
    }
    row = rleMap.getRun(j, 0);
  }

  it('extendRight', () => {
    setupRLE([1, 2, 3]);
    expect(row.length).toBe(1);
  });

  it('extendLeft', () => {
    setupRLE([3, 2, 1]);
    expect(row.length).toBe(1);
  });

  it('extendCenter', () => {
    setupRLE([1, 2, 4, 5, 3]);
    expect(row.length).toBe(1);
  });

  it('overwriteRight', () => {
    setupRLE([1, 2, 3], 2);
    setupRLE([1, 2, 3]);
    expect(row.length).toBe(1);
  });

  it('overwriteLeft', () => {
    setupRLE([1, 2, 3], 2);
    setupRLE([3, 2, 1]);
    expect(row.length).toBe(1);
  });

  it('overwriteCenterLast', () => {
    setupRLE([1, 2, 3, 4, 5], 2);
    setupRLE([1, 2, 4, 5, 3]);
    expect(row.length).toBe(1);
  });

  it('overwriteCenterFirst', () => {
    setupRLE([1, 2, 3, 4, 5], 2);
    setupRLE([3, 2, 4, 1, 5]);
    expect(row.length).toBe(1);
  });

  it('overwrite2Last', () => {
    setupRLE([1, 2, 3], 2);
    setupRLE([3, 1, 2]);
    expect(row.length).toBe(1);
  });

  it('overwriteOutsides', () => {
    setupRLE([1, 2, 3, 4, 5], 2);
    setupRLE([5, 1, 2, 4, 3]);
    expect(row.length).toBe(1);
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
