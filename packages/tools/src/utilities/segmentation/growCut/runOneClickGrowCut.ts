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
  worldPosition: Types.Point3,
  options?: GrowCutOneClickOptions
): PositiveRegionData {
  const [width, height, numSlices] = referencedVolume.dimensions;
  const subVolPixelData =
    referencedVolume.voxelManager.getCompleteScalarDataArray();
  const numPixelsPerSlice = width * height;
  const ijkStartPosition = transformWorldToIndex(
    referencedVolume.imageData,
    worldPosition
  );
  const referencePixelValue =
    subVolPixelData[
      ijkStartPosition[2] * numPixelsPerSlice +
        ijkStartPosition[1] * width +
        ijkStartPosition[0]
    ];

  const positiveSeedVariance =
    options.positiveSeedVariance ?? POSITIVE_SEED_VARIANCE;
  const positiveSeedVarianceValue = Math.abs(
    referencePixelValue * positiveSeedVariance
  );
  const minPositivePixelValue = referencePixelValue - positiveSeedVarianceValue;
  const maxPositivePixelValue = referencePixelValue + positiveSeedVarianceValue;

  // Neighbors distance that will be visited for every pixel
  const neighborsCoordDelta = [
    [-1, 0, 0],
    [1, 0, 0],
    [0, -1, 0],
    [0, 1, 0],
    [0, 0, -1],
    [0, 0, 1],
  ];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const startVoxelIndex =
    ijkStartPosition[2] * numPixelsPerSlice +
    ijkStartPosition[1] * width +
    ijkStartPosition[0];
  const voxelIndexesSet = new Set([startVoxelIndex]);
  const worldVoxelSet = new Set<Types.Point3>([worldPosition]);

  // Add the start point to the queue and traverse all neighbor pixels that are not visited yet and within the positive range
  const queue = [ijkStartPosition];

  // Run breadth first search in 3D space to update the positive and negative seed values
  while (queue.length) {
    const ijkVoxel = queue.shift();
    const [x, y, z] = ijkVoxel;

    // No function calls for better performance
    minX = ijkVoxel[0] < minX ? ijkVoxel[0] : minX;
    minY = ijkVoxel[1] < minY ? ijkVoxel[1] : minY;
    minZ = ijkVoxel[2] < minZ ? ijkVoxel[2] : minZ;
    maxX = ijkVoxel[0] > maxX ? ijkVoxel[0] : maxX;
    maxY = ijkVoxel[1] > maxY ? ijkVoxel[1] : maxY;
    maxZ = ijkVoxel[2] > maxZ ? ijkVoxel[2] : maxZ;

    for (let i = 0, len = neighborsCoordDelta.length; i < len; i++) {
      const neighborCoordDelta = neighborsCoordDelta[i];
      const nx = x + neighborCoordDelta[0];
      const ny = y + neighborCoordDelta[1];
      const nz = z + neighborCoordDelta[2];

      // Continue if it is out of bounds.
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
      const neighborPixelValue = subVolPixelData[neighborVoxelIndex];

      if (
        voxelIndexesSet.has(neighborVoxelIndex) ||
        neighborPixelValue < minPositivePixelValue ||
        neighborPixelValue > maxPositivePixelValue
      ) {
        continue;
      }

      const ijkVoxel: Types.Point3 = [nx, ny, nz];
      const worldVoxel = transformIndexToWorld(
        referencedVolume.imageData,
        ijkVoxel
      );

      voxelIndexesSet.add(neighborVoxelIndex);
      worldVoxelSet.add(worldVoxel);
      queue.push(ijkVoxel);
    }
  }

  return {
    worldVoxels: Array.from(worldVoxelSet),
    boundingBox: {
      topLeft: [minX, minY, minZ],
      bottomRight: [maxX, maxY, maxZ],
    },
  };
}

function _setPositiveSeedValues(
  labelmap: Types.IImageVolume,
  positiveRegionData: PositiveRegionData,
  options?: GrowCutOneClickOptions
) {
  const { dimensions } = labelmap;
  const [width, height] = dimensions;
  const numPixelsPerSlice = width * height;
  const positiveSeedValue = options.positiveSeedValue ?? POSITIVE_SEED_VALUE;
  const { worldVoxels } = positiveRegionData;

  for (let i = 0, len = worldVoxels.length; i < len; i++) {
    const worldVoxel = worldVoxels[i];
    const ijkVoxel = transformWorldToIndex(labelmap.imageData, worldVoxel);
    const voxelIndex =
      ijkVoxel[2] * numPixelsPerSlice + ijkVoxel[1] * width + ijkVoxel[0];

    labelmap.voxelManager.setAtIndex(voxelIndex, positiveSeedValue);
  }
}

function _setNegativeSeedValues(
  subVolume: Types.IImageVolume,
  labelmap: Types.IImageVolume,
  worldPosition: Types.Point3,
  options?: GrowCutOneClickOptions
) {
  const [width, height] = subVolume.dimensions;
  const subVolPixelData = subVolume.voxelManager.getCompleteScalarDataArray();
  const labelmapData = labelmap.voxelManager.getCompleteScalarDataArray();
  const ijkPosition = transformWorldToIndex(subVolume.imageData, worldPosition);
  const referencePixelValue =
    subVolPixelData[
      ijkPosition[2] * width * height + ijkPosition[1] * width + ijkPosition[0]
    ];

  const negativeSeedVariance =
    options.negativeSeedVariance ?? NEGATIVE_SEED_VARIANCE;
  const negativeSeedValue = options.negativeSeedValue ?? NEGATIVE_SEED_VALUE;

  const negativeSeedVarianceValue = Math.abs(
    referencePixelValue * negativeSeedVariance
  );
  const minNegativePixelValue = referencePixelValue - negativeSeedVarianceValue;
  const maxNegativePixelValue = referencePixelValue + negativeSeedVarianceValue;

  for (let i = 0, len = subVolPixelData.length; i < len; i++) {
    const pixelValue = subVolPixelData[i];

    if (
      !labelmapData[i] &&
      (pixelValue < minNegativePixelValue || pixelValue > maxNegativePixelValue)
    ) {
      labelmap.voxelManager.setAtIndex(i, negativeSeedValue);
    }
  }
}

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
  console.time('createLabelmap');
  const labelmap = volumeLoader.createAndCacheDerivedLabelmapVolume(
    subVolume.volumeId
  );
  console.timeEnd('createLabelmap');

  console.time('setPositiveSeedValues');
  _setPositiveSeedValues(labelmap, positiveRegionData, options);
  console.timeEnd('setPositiveSeedValues');

  console.time('setNegativeSeedValues');
  _setNegativeSeedValues(subVolume, labelmap, worldPosition, options);
  console.timeEnd('setNegativeSeedValues');

  return labelmap;
}

async function runOneClickGrowCut(
  referencedVolumeId: string,
  worldPosition: Types.Point3,
  viewport: Types.IViewport,
  options?: GrowCutOneClickOptions
): Promise<Types.IImageVolume> {
  const referencedVolume = cache.getVolume(referencedVolumeId);
  console.time('getPositiveRegionData');
  const positiveRegionData = _getPositiveRegionData(
    referencedVolume,
    worldPosition,
    options
  );
  console.timeEnd('getPositiveRegionData');

  console.time('createSubVolume');
  const subVolume = _createSubVolume(
    referencedVolume,
    positiveRegionData,
    options
  );
  console.timeEnd('createSubVolume');

  console.time('createAndCacheSegmentation');
  const labelmap = await _createAndCacheSegmentation(
    subVolume,
    positiveRegionData,
    worldPosition,
    options
  );
  console.timeEnd('createAndCacheSegmentation');

  console.time('runGrowCut');
  await run(subVolume.volumeId, labelmap.volumeId);
  console.timeEnd('runGrowCut');

  return labelmap;
}

export { runOneClickGrowCut as default, runOneClickGrowCut };
export type { GrowCutOneClickOptions };
