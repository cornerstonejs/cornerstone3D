import type { Point3 } from '../types';
import type { NumberVoxelManager } from './VoxelManager';

type NeighborhoodStats = {
  mean: number;
  stdDev: number;
  count: number;
};

/**
 * Mean and standard deviation over a cubic neighborhood, using the voxel manager's
 * `getAtIJK` (no full scalar buffer required).
 * @param mapValue - If set, each sample is passed through this before mean/std (e.g. VOI-mapped intensity).
 */
export function calculateNeighborhoodStats(
  voxelManager: NumberVoxelManager,
  dimensions: Point3,
  centerIjk: Point3,
  radius: number,
  mapValue?: (v: number) => number
): NeighborhoodStats {
  const [width, height, numSlices] = dimensions;

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  const [cx, cy, cz] = centerIjk.map(Math.round);

  for (let z = cz - radius; z <= cz + radius; z++) {
    if (z < 0 || z >= numSlices) {
      continue;
    }
    for (let y = cy - radius; y <= cy + radius; y++) {
      if (y < 0 || y >= height) {
        continue;
      }
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (x < 0 || x >= width) {
          continue;
        }

        const raw = voxelManager.getAtIJK(x, y, z);
        const value = mapValue ? mapValue(raw) : raw;
        sum += value;
        sumSq += value * value;
        count++;
      }
    }
  }

  if (count === 0) {
    if (
      cx >= 0 &&
      cx < width &&
      cy >= 0 &&
      cy < height &&
      cz >= 0 &&
      cz < numSlices
    ) {
      const raw = voxelManager.getAtIJK(cx, cy, cz);
      const centerValue = mapValue ? mapValue(raw) : raw;
      return { mean: centerValue, stdDev: 0, count: 1 };
    }
    return { mean: 0, stdDev: 0, count: 0 };
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  const stdDev = Math.sqrt(Math.max(0, variance));

  return { mean, stdDev, count };
}
