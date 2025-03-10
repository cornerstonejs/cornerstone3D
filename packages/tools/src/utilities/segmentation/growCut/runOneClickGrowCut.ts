import { vec3 } from 'gl-matrix';
import { utilities as csUtils, cache, volumeLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { run } from './runGrowCut';
import type { GrowCutOptions } from './runGrowCut';

const { transformWorldToIndex, transformIndexToWorld } = csUtils;

const POSITIVE_SEED_VALUE = 254;
const NEGATIVE_SEED_VALUE = 255;
const POSITIVE_SEED_VARIANCE = 0.1;
const NEGATIVE_SEED_VARIANCE = 0.8;
const SUBVOLUME_PADDING_PERCENTAGE = 0.2;
const SUBVOLUME_MIN_PADDING = 5;

type GrowCutOneClickOptions = GrowCutOptions & {
  subVolumePaddingPercentage?: number | [number, number, number];
  subVolumeMinPadding?: number | [number, number, number];
};

type PositiveRegionData = {
  worldVoxels: Types.Point3[];
  boundingBox: {
    topLeft: Types.Point3;
    bottomRight: Types.Point3;
  };
};

/**
 * Calculate the sub-volume size based on the bounding box that that contains
 * all the voxels set as positive seed
 * @param referencedVolume - Referenced volume
 * @param positiveRegionData - Positive region data
 * @returns A sub-volume with the size of the positive region + padding
 */
function _createSubVolume(
  referencedVolume: Types.IImageVolume,
  positiveRegionData: PositiveRegionData,
  options: GrowCutOneClickOptions
) {
  const { dimensions } = referencedVolume;
  const positiveRegionSize = vec3.sub(
    vec3.create(),
    positiveRegionData.boundingBox.bottomRight,
    positiveRegionData.boundingBox.topLeft
  );

  let subVolumePaddingPercentage =
    options?.subVolumePaddingPercentage ?? SUBVOLUME_PADDING_PERCENTAGE;
  let subVolumeMinPadding =
    options?.subVolumeMinPadding ?? SUBVOLUME_MIN_PADDING;

  if (typeof subVolumePaddingPercentage === 'number') {
    subVolumePaddingPercentage = [
      subVolumePaddingPercentage,
      subVolumePaddingPercentage,
      subVolumePaddingPercentage,
    ];
  }

  if (typeof subVolumeMinPadding === 'number') {
    subVolumeMinPadding = [
      subVolumeMinPadding,
      subVolumeMinPadding,
      subVolumeMinPadding,
    ];
  }

  // Calculate the sub-volume from subVolumePaddingPercentage
  const padding = vec3.mul(
    vec3.create(),
    positiveRegionSize,
    subVolumePaddingPercentage
  );

  // Round the padding since it is in IJK space and also consider the minimum
  // padding (in pixels) otherwise it may add less than 3 pixels when dealing
  // with very small positive regions.
  vec3.round(padding, padding);
  vec3.max(padding, padding, subVolumeMinPadding as vec3);

  const subVolumeSize = vec3.scaleAndAdd(
    vec3.create(),
    positiveRegionSize,
    padding,
    2
  );

  const ijkTopLeft = vec3.sub(
    vec3.create(),
    positiveRegionData.boundingBox.topLeft,
    padding
  );

  const ijkBottomRight = vec3.add(vec3.create(), ijkTopLeft, subVolumeSize);

  vec3.max(ijkTopLeft, ijkTopLeft, [0, 0, 0]);
  vec3.min(ijkTopLeft, ijkTopLeft, dimensions);

  vec3.max(ijkBottomRight, ijkBottomRight, [0, 0, 0]);
  vec3.min(ijkBottomRight, ijkBottomRight, dimensions);

  const subVolumeBoundsIJK: Types.AABB3 = {
    minX: ijkTopLeft[0],
    maxX: ijkBottomRight[0],
    minY: ijkTopLeft[1],
    maxY: ijkBottomRight[1],
    minZ: ijkTopLeft[2],
    maxZ: ijkBottomRight[2],
  };

  return csUtils.createSubVolume(
    referencedVolume.volumeId,
    subVolumeBoundsIJK,
    {
      targetBuffer: {
        type: 'Float32Array',
      },
    }
  );
}

/**
 * Get the some information about the voxels that will be set as positive seed
 * in order to be able to calculate the sub-volume size.
 * @param referencedVolume - Referenced volume
 * @param worldPosition - Coordinate where the user clicked in world space
 * @param options - OneClick grow cut options
 * @returns An object that contains all voxels that should be set as positive
 * in world space and its bounding box
 */
function _getPositiveRegionData(
  referencedVolume: Types.IImageVolume,
  labelmap: Types.IImageVolume,
  worldPosition: Types.Point3,
  options?: GrowCutOneClickOptions
): PositiveRegionData {
  const [width, height, numSlices] = referencedVolume.dimensions;
  const subVolPixelData =
    referencedVolume.voxelManager.getCompleteScalarDataArray();
  const labelmapData = labelmap.voxelManager.getCompleteScalarDataArray();
  const numPixelsPerSlice = width * height;

  // Convert clicked worldPosition => IJK index
  const ijkStartPosition = transformWorldToIndex(
    referencedVolume.imageData,
    worldPosition
  );

  // Get the intensity at the clicked voxel
  const startIndex =
    ijkStartPosition[2] * numPixelsPerSlice +
    ijkStartPosition[1] * width +
    ijkStartPosition[0];
  const referencePixelValue = subVolPixelData[startIndex];

  // Positive seed intensity range
  const positiveSeedVariance =
    options.positiveSeedVariance ?? POSITIVE_SEED_VARIANCE;
  console.debug('🚀 ~ positiveSeedVariance:', positiveSeedVariance);
  const positiveSeedVarianceValue = Math.abs(
    referencePixelValue * positiveSeedVariance
  );
  const minPositivePixelValue = referencePixelValue - positiveSeedVarianceValue;
  const maxPositivePixelValue = referencePixelValue + positiveSeedVarianceValue;

  // Negative seed intensity range
  const negativeSeedVariance =
    options.negativeSeedVariance ?? NEGATIVE_SEED_VARIANCE;
  const negativeSeedVarianceValue = Math.abs(
    referencePixelValue * negativeSeedVariance
  );
  const minNegativePixelValue = referencePixelValue - negativeSeedVarianceValue;
  const maxNegativePixelValue = referencePixelValue + negativeSeedVarianceValue;

  // Seed labels
  const positiveSeedValue = options.positiveSeedValue ?? POSITIVE_SEED_VALUE;
  const negativeSeedValue = options.negativeSeedValue ?? NEGATIVE_SEED_VALUE;

  // 6-connected neighbors in 3D
  const neighborsCoordDelta = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
  ];

  // For bounding box
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  // Track visited voxels in a Set
  const voxelIndexesSet = new Set([startIndex]);

  // Mark the start voxel in the labelmap as positive
  labelmap.voxelManager.setAtIndex(startIndex, positiveSeedValue);

  // BFS queue
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
  // Expand the bounding box slightly (e.g. by 'margin' voxels in each direction)
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

    // Randomly pick a voxel in the expanded bounding box region
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

    // Skip if it's already part of the positive region
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

  // Return bounding info, etc.
  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    // If you need them:
    // positiveVoxelIndexes: voxelIndexesSet,
    // negativeVoxelIndexes: negativeIndexesSet
  };
}

// function _setPositiveSeedValues(
//   labelmap: Types.IImageVolume,
//   positiveRegionData: PositiveRegionData,
//   options?: GrowCutOneClickOptions
// ) {
//   const { dimensions } = labelmap;
//   const [width, height] = dimensions;
//   const numPixelsPerSlice = width * height;
//   const positiveSeedValue = options.positiveSeedValue ?? POSITIVE_SEED_VALUE;
//   const { worldVoxels } = positiveRegionData;

//   for (let i = 0, len = worldVoxels.length; i < len; i++) {
//     const worldVoxel = worldVoxels[i];
//     const ijkVoxel = transformWorldToIndex(labelmap.imageData, worldVoxel);
//     const voxelIndex =
//       ijkVoxel[2] * numPixelsPerSlice + ijkVoxel[1] * width + ijkVoxel[0];

//     labelmap.voxelManager.setAtIndex(voxelIndex, positiveSeedValue);
//   }
// }

// function _setNegativeSeedValues(
//   subVolume: Types.IImageVolume,
//   labelmap: Types.IImageVolume,
//   worldPosition: Types.Point3,
//   options?: GrowCutOneClickOptions
// ) {
//   const [width, height] = subVolume.dimensions;
//   const subVolPixelData = subVolume.voxelManager.getCompleteScalarDataArray();
//   const labelmapData = labelmap.voxelManager.getCompleteScalarDataArray();
//   const ijkPosition = transformWorldToIndex(subVolume.imageData, worldPosition);
//   const referencePixelValue =
//     subVolPixelData[
//       ijkPosition[2] * width * height + ijkPosition[1] * width + ijkPosition[0]
//     ];

//   const negativeSeedVariance =
//     options.negativeSeedVariance ?? NEGATIVE_SEED_VARIANCE;
//   const negativeSeedValue = options.negativeSeedValue ?? NEGATIVE_SEED_VALUE;

//   const negativeSeedVarianceValue = Math.abs(
//     referencePixelValue * negativeSeedVariance
//   );
//   const minNegativePixelValue = referencePixelValue - negativeSeedVarianceValue;
//   const maxNegativePixelValue = referencePixelValue + negativeSeedVarianceValue;

//   for (let i = 0, len = subVolPixelData.length; i < len; i++) {
//     const pixelValue = subVolPixelData[i];

//     if (
//       !labelmapData[i] &&
//       (pixelValue < minNegativePixelValue || pixelValue > maxNegativePixelValue)
//     ) {
//       labelmap.voxelManager.setAtIndex(i, negativeSeedValue);
//     }
//   }
// }

/**
 * Create a label map for the given sub-volume and update some all positive
 * and negative seed voxels
 * @param subVolume - Volume that shall be used to create a labelmap
 * @param positiveRegionData - Positive region data
 * @param worldPosition - Coordinate where the user clicked in world space
 * @param options - OneClick grow cut options
 * @returns
 */
async function _createAndCacheSegmentation(
  subVolume: Types.IImageVolume,
  positiveRegionData: PositiveRegionData,
  worldPosition: Types.Point3,
  options?: GrowCutOneClickOptions
): Promise<Types.IImageVolume> {
  const labelmap = volumeLoader.createAndCacheDerivedLabelmapVolume(
    subVolume.volumeId
  );
  _setPositiveSeedValues(labelmap, positiveRegionData, options);
  _setNegativeSeedValues(subVolume, labelmap, worldPosition, options);

  return labelmap;
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
  labelmapVolumeId,
  options,
}: {
  referencedVolumeId: string;
  worldPosition: Types.Point3;
  labelmapVolumeId: string;
  options?: GrowCutOneClickOptions;
}): Promise<Types.IImageVolume> {
  const referencedVolume = cache.getVolume(referencedVolumeId);
  // const labelmap =
  //   volumeLoader.createAndCacheDerivedLabelmapVolume(referencedVolumeId);

  const labelmap = cache.getVolume(labelmapVolumeId);

  console.time('getPositiveRegionData');
  _getPositiveRegionData(referencedVolume, labelmap, worldPosition, options);
  console.timeEnd('getPositiveRegionData');

  // const subVolume = _createSubVolume(
  //   referencedVolume,
  //   positiveRegionData,
  //   options
  // );

  // const labelmap = await _createAndCacheSegmentation(
  //   subVolume,
  //   positiveRegionData,
  //   worldPosition,
  //   options
  // );
  console.time('runGrowCut');
  // await run(referencedVolumeId, labelmap.volumeId);
  console.timeEnd('runGrowCut');

  // return labelmap;
}

export { runOneClickGrowCut as default, runOneClickGrowCut };
export type { GrowCutOneClickOptions };
