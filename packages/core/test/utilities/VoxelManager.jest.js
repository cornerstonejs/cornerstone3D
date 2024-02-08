import { VoxelManager } from '../../src/utilities';
import { describe, it, expect } from '@jest/globals';

const size = [64, 128, 4];

const ijkPoint = [4, 2, 2];

describe('VoxelManager', () => {
  it('setAtIJKPoint', () => {
    const map = VoxelManager.createMapVoxelManager(size);
    map.setAtIJKPoint(ijkPoint, ijkPoint);
    expect(map.getAtIJKPoint(ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIJK(...ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIndex(map.toIndex(ijkPoint))).toBe(ijkPoint);
  });

  it('setAtIJK', () => {
    const map = VoxelManager.createMapVoxelManager(size);
    map.setAtIJK(...ijkPoint, ijkPoint);
    expect(map.getAtIJK(...ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIJKPoint(ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIndex(map.toIndex(ijkPoint))).toBe(ijkPoint);
  });

  it('setAtIndex', () => {
    const map = VoxelManager.createMapVoxelManager(size);
    map.setAtIndex(map.toIndex(ijkPoint), ijkPoint);
    expect(map.getAtIJK(...ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIJKPoint(ijkPoint)).toBe(ijkPoint);
    expect(map.getAtIndex(map.toIndex(ijkPoint))).toBe(ijkPoint);
  });

  describe('LazyVoxelManager', () => {
    it('Allocates data as required', () => {
      const map = VoxelManager.createLazyVoxelManager(
        size,
        (width, height) => new Uint16Array(width * height)
      );
      expect(map.map.get(ijkPoint[2])).toBeUndefined();
      map.setAtIJKPoint(ijkPoint, 3);
      expect(map.map.get(ijkPoint[2])).not.toBeUndefined();
    });

    it('sets', () => {
      const map = VoxelManager.createLazyVoxelManager(
        size,
        (width, height) => new Uint8Array(width * height)
      );
      map.setAtIJK(...ijkPoint, 15);
      expect(map.getAtIJK(...ijkPoint)).toBe(15);
      expect(map.getAtIJKPoint(ijkPoint)).toBe(15);
      expect(map.getAtIndex(map.toIndex(ijkPoint))).toBe(15);
    });
  });
});
