import { utilities as csUtils, cache, volumeLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { run } from './runGrowCut';
import type { GrowCutOptions } from './runGrowCut';
import {
  POSITIVE_SEED_LABEL,
  NEGATIVE_SEED_LABEL,
  DEFAULT_NEIGHBORHOOD_RADIUS,
  DEFAULT_POSITIVE_STD_DEV_MULTIPLIER,
  DEFAULT_NEGATIVE_STD_DEV_MULTIPLIER,
  DEFAULT_NEGATIVE_SEED_MARGIN,
  DEFAULT_NEGATIVE_SEEDS_COUNT,
  MAX_NEGATIVE_SEED_ATTEMPTS_MULTIPLIER,
} from './constants';

const { transformWorldToIndex } = csUtils;

type GrowCutOneClickOptions = GrowCutOptions & {
  // Radius of the neighborhood (in voxels) around the click point used to calculate initial statistics (mean, stdDev). E.g., 1 means a 3x3x3 neighborhood.
  initialNeighborhoodRadius?: number;
  // Multiplier (k) for standard deviation used to define the positive seed intensity range (mean +/- k * stdDev).
  positiveStdDevMultiplier?: number;
  // Multiplier (negK) for standard deviation used to define negative seeds. A voxel is considered negative if its intensity is further than negK * stdDev away from the mean intensity of the identified positive seeds.
  negativeStdDevMultiplier?: number;
  // Margin (in voxels) around the bounding box of positive seeds where negative seeds are sampled.
  negativeSeedMargin?: number;
  // Target number of negative seeds to sample.
  negativeSeedsTargetPatches?: number;
  // The value assigned to positive seeds in the labelmap.
  positiveSeedValue?: number;
  // The value assigned to negative seeds in the labelmap.
  negativeSeedValue?: number;
  seeds?: {
    positiveSeedIndices: Set<number>;
    negativeSeedIndices: Set<number>;
  };
};

const MAX_POSITIVE_SEEDS = 100000; // Maximum number of positive seeds to prevent excessive growth

/**
 * Calculates positive and negative seed indices for the GrowCut algorithm based on a single click.
 * Does not modify any labelmap volume.
 * @param referencedVolume - Referenced volume
 * @param worldPosition - Coordinate where the user clicked in world space
 * @param options - Configuration options for seed generation
 * @returns An object containing sets of positive and negative seed indices, or null if seeding fails.
 */
function calculateGrowCutSeeds(
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  options?: GrowCutOneClickOptions
): {
  positiveSeedIndices: Set<number>;
  negativeSeedIndices: Set<number>;
} | null {
  const { dimensions, imageData: refImageData } = referencedVolume;
  const [width, height, numSlices] = dimensions;
  const referenceVolumeVoxelManager = referencedVolume.voxelManager;
  const scalarData = referenceVolumeVoxelManager.getCompleteScalarDataArray();
  const numPixelsPerSlice = width * height;

  const neighborhoodRadius =
    options?.initialNeighborhoodRadius ?? DEFAULT_NEIGHBORHOOD_RADIUS;
  const positiveK =
    options?.positiveStdDevMultiplier ?? DEFAULT_POSITIVE_STD_DEV_MULTIPLIER;
  const negativeK =
    options?.negativeStdDevMultiplier ?? DEFAULT_NEGATIVE_STD_DEV_MULTIPLIER;
  const negativeSeedMargin =
    options?.negativeSeedMargin ?? DEFAULT_NEGATIVE_SEED_MARGIN;
  const negativeSeedsTargetPatches =
    options?.negativeSeedsTargetPatches ?? DEFAULT_NEGATIVE_SEEDS_COUNT;

  const ijkStart = transformWorldToIndex(refImageData, worldPosition).map(
    Math.round
  );
  const startIndex = referenceVolumeVoxelManager.toIndex(ijkStart);

  if (
    ijkStart[0] < 0 ||
    ijkStart[0] >= width ||
    ijkStart[1] < 0 ||
    ijkStart[1] >= height ||
    ijkStart[2] < 0 ||
    ijkStart[2] >= numSlices
  ) {
    console.warn('Click position is outside volume bounds.');
    return null;
  }

  const initialStats = csUtils.calculateNeighborhoodStats(
    scalarData as Types.PixelDataTypedArray,
    dimensions,
    ijkStart,
    neighborhoodRadius
  );

  if (initialStats.count === 0) {
    initialStats.mean = scalarData[startIndex];
    initialStats.stdDev = 0;
  }

  const positiveIntensityMin =
    initialStats.mean - positiveK * initialStats.stdDev;
  const positiveIntensityMax =
    initialStats.mean + positiveK * initialStats.stdDev;

  const neighborsCoordDelta = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
  ];

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  const positiveSeedIndices = new Set<number>();
  const queue: Array<[number, number, number]> = [];

  const startValue = scalarData[startIndex];
  if (
    startValue >= positiveIntensityMin &&
    startValue <= positiveIntensityMax
  ) {
    positiveSeedIndices.add(startIndex);
    queue.push(ijkStart);
    minX = maxX = ijkStart[0];
    minY = maxY = ijkStart[1];
    minZ = maxZ = ijkStart[2];
  } else {
    console.warn(
      'Clicked voxel intensity is outside the calculated positive range. No positive seeds generated.'
    );
    return { positiveSeedIndices: new Set(), negativeSeedIndices: new Set() };
  }

  // ---------------------------------
  // 1) BFS FOR POSITIVE SEEDS using local stats
  // ---------------------------------
  let currentQueueIndex = 0;
  while (
    currentQueueIndex < queue.length &&
    positiveSeedIndices.size < MAX_POSITIVE_SEEDS
  ) {
    const [x, y, z] = queue[currentQueueIndex++];

    minX = Math.min(x, minX);
    minY = Math.min(y, minY);
    minZ = Math.min(z, minZ);
    maxX = Math.max(x, maxX);
    maxY = Math.max(y, maxY);
    maxZ = Math.max(z, maxZ);

    for (let i = 0; i < neighborsCoordDelta.length; i++) {
      const [dx, dy, dz] = neighborsCoordDelta[i];
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;

      if (
        nx < 0 ||
        nx >= width ||
        ny < 0 ||
        ny >= height ||
        nz < 0 ||
        nz >= numSlices
      ) {
        continue;
      }

      const neighborIndex = nz * numPixelsPerSlice + ny * width + nx;
      if (positiveSeedIndices.has(neighborIndex)) {
        continue;
      }

      const neighborValue = scalarData[neighborIndex];
      if (
        neighborValue >= positiveIntensityMin &&
        neighborValue <= positiveIntensityMax
      ) {
        positiveSeedIndices.add(neighborIndex);
        if (positiveSeedIndices.size < MAX_POSITIVE_SEEDS) {
          queue.push([nx, ny, nz]);
        }
      }
    }
  }

  if (positiveSeedIndices.size >= MAX_POSITIVE_SEEDS) {
    console.debug(
      `Reached maximum number of positive seeds (${MAX_POSITIVE_SEEDS}). Stopping BFS.`
    );
  }

  if (positiveSeedIndices.size === 0) {
    console.warn('No positive seeds found after BFS.');
    return { positiveSeedIndices: new Set(), negativeSeedIndices: new Set() };
  }

  // ---------------------------------
  // 2) Calculate Statistics of the Found Positive Seeds
  // ---------------------------------
  let positiveSum = 0;
  let positiveSumSq = 0;
  positiveSeedIndices.forEach((index) => {
    const value = scalarData[index];
    positiveSum += value;
    positiveSumSq += value * value;
  });

  const positiveCount = positiveSeedIndices.size;
  const positiveMean = positiveSum / positiveCount;
  const positiveVariance =
    positiveSumSq / positiveCount - positiveMean * positiveMean;
  const positiveStdDev = Math.sqrt(Math.max(0, positiveVariance));
  const negativeDiffThreshold = negativeK * positiveStdDev;

  // ---------------------------------
  // 3) SAMPLE NEGATIVE SEED PATCHES (3x3x1)
  // ---------------------------------
  const minXm = Math.max(0, minX - negativeSeedMargin);
  const minYm = Math.max(0, minY - negativeSeedMargin);
  const minZm = Math.max(0, minZ - negativeSeedMargin);
  const maxXm = Math.min(width - 1, maxX + negativeSeedMargin);
  const maxYm = Math.min(height - 1, maxY + negativeSeedMargin);
  const maxZm = Math.min(numSlices - 1, maxZ + negativeSeedMargin);

  const negativeSeedIndices = new Set<number>();
  let attempts = 0;
  let patchesAdded = 0;
  const maxAttempts =
    negativeSeedsTargetPatches * MAX_NEGATIVE_SEED_ATTEMPTS_MULTIPLIER;

  while (patchesAdded < negativeSeedsTargetPatches && attempts < maxAttempts) {
    attempts++;

    // Sample a *center* point for the potential patch
    const rx = Math.floor(Math.random() * (maxXm - minXm + 1) + minXm);
    const ry = Math.floor(Math.random() * (maxYm - minYm + 1) + minYm);
    const rz = Math.floor(Math.random() * (maxZm - minZm + 1) + minZm);

    const centerIndex = rz * numPixelsPerSlice + ry * width + rx;

    if (
      positiveSeedIndices.has(centerIndex) ||
      negativeSeedIndices.has(centerIndex)
    ) {
      continue;
    }

    const centerValue = scalarData[centerIndex];
    if (Math.abs(centerValue - positiveMean) > negativeDiffThreshold) {
      let patchContributed = false;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = ry + dy;
        if (ny < 0 || ny >= height) {
          continue;
        }

        for (let dx = -1; dx <= 1; dx++) {
          const nx = rx + dx;
          // Bounds check X
          if (nx < 0 || nx >= width) {
            continue;
          }

          // Z coordinate is fixed at rz (slice of the center point)
          const neighborIndex = rz * numPixelsPerSlice + ny * width + nx;

          if (
            positiveSeedIndices.has(neighborIndex) ||
            negativeSeedIndices.has(neighborIndex)
          ) {
            continue;
          }

          negativeSeedIndices.add(neighborIndex);
          patchContributed = true;
        }
      }

      if (patchContributed) {
        patchesAdded++;
      }
    }
  }

  if (negativeSeedIndices.size === 0) {
    console.warn(
      'Could not find any negative seeds. GrowCut might fail or produce poor results.'
    );
  }

  console.debug('positiveSeedIndices', positiveSeedIndices.size);
  console.debug('negativeSeedIndices', negativeSeedIndices.size);

  return { positiveSeedIndices, negativeSeedIndices };
}

/**
 * Runs one click grow cut segmentation algorithm
 * @param referencedVolumeId - The volume ID to segment
 * @param worldPosition - The clicked position in world coordinates
 * @param options - Configuration options for the grow cut algorithm and seed generation
 * @returns The segmented labelmap volume
 */
async function runOneClickGrowCut({
  referencedVolumeId,
  worldPosition,
  options,
}: {
  referencedVolumeId: string;
  worldPosition: Types.Point3;
  options?: GrowCutOneClickOptions;
}): Promise<Types.IImageVolume | null> {
  const referencedVolume = cache.getVolume(referencedVolumeId);
  const labelmap =
    volumeLoader.createAndCacheDerivedLabelmapVolume(referencedVolumeId);

  // reset the volume
  labelmap.voxelManager.forEach(({ index, value }) => {
    if (value !== 0) {
      labelmap.voxelManager.setAtIndex(index, 0);
    }
  });

  const seeds =
    options.seeds ??
    calculateGrowCutSeeds(referencedVolume, worldPosition, options);

  const positiveSeedLabel = options?.positiveSeedValue ?? POSITIVE_SEED_LABEL;
  const negativeSeedLabel = options?.negativeSeedValue ?? NEGATIVE_SEED_LABEL;

  if (!seeds) {
    return null;
  }

  const { positiveSeedIndices, negativeSeedIndices } = seeds;

  if (
    positiveSeedIndices.size < 10 ||
    positiveSeedIndices.size > MAX_POSITIVE_SEEDS ||
    negativeSeedIndices.size < 10
  ) {
    console.warn(
      'Not enough seeds found. GrowCut might fail or produce poor results.'
    );
    return labelmap;
  }

  // Apply the calculated seeds to the labelmap
  positiveSeedIndices.forEach((index) => {
    labelmap.voxelManager.setAtIndex(index, positiveSeedLabel);
  });

  negativeSeedIndices.forEach((index) => {
    labelmap.voxelManager.setAtIndex(index, negativeSeedLabel);
  });

  await run(referencedVolumeId, labelmap.volumeId, options);

  return labelmap;
}

export {
  runOneClickGrowCut as default,
  runOneClickGrowCut,
  calculateGrowCutSeeds,
};
export type { GrowCutOneClickOptions };
