import type { PixelDataTypedArray, Point3 } from '../types';

type NeighborhoodStats = {
  mean: number;
  stdDev: number;
  count: number;
};
/**
 * Calculates statistical properties (mean, standard deviation) of a neighborhood around a center point in a 3D volume.
 * @param scalarData - The array containing voxel intensity values
 * @param dimensions - The dimensions of the volume [width, height, depth]
 * @param centerIjk - The center point coordinates in IJK space
 * @param radius - The radius of the neighborhood to analyze in pixels
 * @returns An object containing the mean, standard deviation, and count of voxels in the neighborhood
 */
export function calculateNeighborhoodStats(
  scalarData: PixelDataTypedArray,
  dimensions: Point3,
  centerIjk: Point3,
  radius: number
): NeighborhoodStats {
  const [width, height, numSlices] = dimensions;
  const numPixelsPerSlice = width * height;

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

        const index = z * numPixelsPerSlice + y * width + x;
        const value = scalarData[index];
        sum += value;
        sumSq += value * value;
        count++;
      }
    }
  }

  if (count === 0) {
    const centerIndex = cz * numPixelsPerSlice + cy * width + cx;
    if (centerIndex >= 0 && centerIndex < scalarData.length) {
      const centerValue = scalarData[centerIndex];
      return { mean: centerValue, stdDev: 0, count: 1 };
    } else {
      return { mean: 0, stdDev: 0, count: 0 }; // Or throw error
    }
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  const stdDev = Math.sqrt(Math.max(0, variance)); // Ensure non-negative variance

  return { mean, stdDev, count };
}
