import { utilities as csUtils, cache, volumeLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { run } from './runGrowCut';
import type { GrowCutOptions } from './runGrowCut';

const { transformWorldToIndex, transformIndexToWorld } = csUtils;

const POSITIVE_SEED_VALUE = 254;
const NEGATIVE_SEED_VALUE = 255;
const POSITIVE_SEED_VARIANCE = 0.1;
const NEGATIVE_SEED_VARIANCE = 0.8;

type GrowCutOneClickOptions = GrowCutOptions & {
  subVolumePaddingPercentage?: number | [number, number, number];
  subVolumeMinPadding?: number | [number, number, number];
  negativeSeedMargin?: number;
  negativeSeedsCount?: number;
};

/**
 * Get the some information about the voxels that will be set as positive seed
 * in order to be able to calculate the sub-volume size.
 * @param referencedVolume - Referenced volume
 * @param worldPosition - Coordinate where the user clicked in world space
 * @param options - OneClick grow cut options
 * @returns An object that contains all voxels that should be set as positive
 * in world space and its bounding box
 */
function _generateSeeds(
  referencedVolume: Types.IImageVolume,
  labelmap: Types.IImageVolume,
  worldPosition: Types.Point3,
  options?: GrowCutOneClickOptions
) {
  const [width, height, numSlices] = referencedVolume.dimensions;
  const subVolPixelData =
    referencedVolume.voxelManager.getCompleteScalarDataArray();
  const numPixelsPerSlice = width * height;

  // Convert clicked worldPosition => IJK index
  const ijkStartPosition = transformWorldToIndex(
    referencedVolume.imageData,
    worldPosition
  );
  const startIndex =
    ijkStartPosition[2] * numPixelsPerSlice +
    ijkStartPosition[1] * width +
    ijkStartPosition[0];
  const referencePixelValue = subVolPixelData[startIndex];

  const positiveSeedVariance =
    options.positiveSeedVariance ?? POSITIVE_SEED_VARIANCE;
  const positiveSeedVarianceValue = Math.abs(
    referencePixelValue * positiveSeedVariance
  );
  const minPositivePixelValue = referencePixelValue - positiveSeedVarianceValue;
  const maxPositivePixelValue = referencePixelValue + positiveSeedVarianceValue;

  const negativeSeedVariance =
    options.negativeSeedVariance ?? NEGATIVE_SEED_VARIANCE;
  const negativeSeedVarianceValue = Math.abs(
    referencePixelValue * negativeSeedVariance
  );
  const minNegativePixelValue = referencePixelValue - negativeSeedVarianceValue;
  const maxNegativePixelValue = referencePixelValue + negativeSeedVarianceValue;

  const positiveSeedValue = options.positiveSeedValue ?? POSITIVE_SEED_VALUE;
  const negativeSeedValue = options.negativeSeedValue ?? NEGATIVE_SEED_VALUE;

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
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  const voxelIndexesSet = new Set([startIndex]);

  labelmap.voxelManager.setAtIndex(startIndex, positiveSeedValue);

  const queue = [ijkStartPosition];

  // ---------------------------------
  // 1) BFS FOR POSITIVE SEEDS
  // ---------------------------------
  while (queue.length) {
    const [x, y, z] = queue.shift();

    // Update bounding box
    minX = x < minX ? x : minX;
    minY = y < minY ? y : minY;
    minZ = z < minZ ? z : minZ;
    maxX = x > maxX ? x : maxX;
    maxY = y > maxY ? y : maxY;
    maxZ = z > maxZ ? z : maxZ;

    // Check neighbors
    for (let i = 0; i < neighborsCoordDelta.length; i++) {
      const [dx, dy, dz] = neighborsCoordDelta[i];
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;

      // Bounds check
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

      const neighborVoxelIndex = nz * numPixelsPerSlice + ny * width + nx;
      if (voxelIndexesSet.has(neighborVoxelIndex)) {
        continue; // Already visited
      }

      const neighborPixelValue = subVolPixelData[neighborVoxelIndex];

      // Within the positive seed range?
      if (
        neighborPixelValue >= minPositivePixelValue &&
        neighborPixelValue <= maxPositivePixelValue
      ) {
        labelmap.voxelManager.setAtIndex(neighborVoxelIndex, positiveSeedValue);
        voxelIndexesSet.add(neighborVoxelIndex);
        queue.push([nx, ny, nz]);
      }
    }
  }

  // ---------------------------------
  // 2) SAMPLE NEGATIVE SEEDS NEAR THE POSITIVE BOUNDING BOX
  // ---------------------------------
  const margin = options.negativeSeedMargin ?? 30;
  const minXwMargin = Math.max(0, minX - margin);
  const minYwMargin = Math.max(0, minY - margin);
  const minZwMargin = Math.max(0, minZ - margin);
  const maxXwMargin = Math.min(width - 1, maxX + margin);
  const maxYwMargin = Math.min(height - 1, maxY + margin);
  const maxZwMargin = Math.min(numSlices - 1, maxZ + margin);

  const negativeSeedsCount = options.negativeSeedsCount ?? 70;
  const negativeIndexesSet = new Set<number>();

  let attempts = 0;
  while (
    negativeIndexesSet.size < negativeSeedsCount &&
    attempts < negativeSeedsCount * 50
  ) {
    attempts++;

    const rx = Math.floor(
      Math.random() * (maxXwMargin - minXwMargin + 1) + minXwMargin
    );
    const ry = Math.floor(
      Math.random() * (maxYwMargin - minYwMargin + 1) + minYwMargin
    );
    const rz = Math.floor(
      Math.random() * (maxZwMargin - minZwMargin + 1) + minZwMargin
    );

    const randomIndex = rz * numPixelsPerSlice + ry * width + rx;

    if (voxelIndexesSet.has(randomIndex)) {
      continue;
    }

    // Check intensity is in the negative range
    const randomVal = subVolPixelData[randomIndex];
    if (
      randomVal >= minNegativePixelValue &&
      randomVal <= maxNegativePixelValue
    ) {
      labelmap.voxelManager.setAtIndex(randomIndex, negativeSeedValue);
      negativeIndexesSet.add(randomIndex);
    }
  }
}

/**
 * Runs one click grow cut segmentation algorithm
 * @param referencedVolumeId - The volume ID to segment
 * @param worldPosition - The clicked position in world coordinates
 * @param viewport - The viewport where the segmentation is being performed
 * @param options - Configuration options for the grow cut algorithm
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
}): Promise<Types.IImageVolume> {
  const referencedVolume = cache.getVolume(referencedVolumeId);
  const labelmap =
    volumeLoader.createAndCacheDerivedLabelmapVolume(referencedVolumeId);

  _generateSeeds(referencedVolume, labelmap, worldPosition, options);

  await run(referencedVolumeId, labelmap.volumeId);

  return labelmap;
}

export { runOneClickGrowCut as default, runOneClickGrowCut };
export type { GrowCutOneClickOptions };
