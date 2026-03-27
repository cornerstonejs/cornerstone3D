import { utilities as csUtils, cache, volumeLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import floodFill from '../floodFill';
import IslandRemoval from '../islandRemoval';
import {
  DEFAULT_NEIGHBORHOOD_RADIUS,
  DEFAULT_POSITIVE_STD_DEV_MULTIPLIER,
} from './constants';

const { transformWorldToIndex } = csUtils;

type FloodFillSegmentationOptions = {
  positiveStdDevMultiplier?: number;
  initialNeighborhoodRadius?: number;
  segmentIndex?: number;
  maxInternalRemove?: number;
};

/**
 * Computes the positive intensity range [min, max] from a click position using
 * neighborhood statistics. Reuses the same logic as calculateGrowCutSeeds.
 */
function getPositiveIntensityRange(
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  options?: {
    positiveStdDevMultiplier?: number;
    initialNeighborhoodRadius?: number;
  }
): { min: number; max: number; ijkStart: Types.Point3 } | null {
  const { dimensions, imageData: refImageData } = referencedVolume;
  const [width, height, numSlices] = dimensions;
  const referenceVolumeVoxelManager = referencedVolume.voxelManager;
  const scalarData = referenceVolumeVoxelManager.getCompleteScalarDataArray();

  const neighborhoodRadius =
    options?.initialNeighborhoodRadius ?? DEFAULT_NEIGHBORHOOD_RADIUS;
  const positiveK =
    options?.positiveStdDevMultiplier ?? DEFAULT_POSITIVE_STD_DEV_MULTIPLIER;

  const ijkStart = transformWorldToIndex(refImageData, worldPosition).map(
    Math.round
  ) as Types.Point3;
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

  const min = initialStats.mean - positiveK * initialStats.stdDev;
  const max = initialStats.mean + positiveK * initialStats.stdDev;

  const startValue = scalarData[startIndex];
  if (startValue < min || startValue > max) {
    console.warn(
      'Clicked voxel intensity is outside the calculated positive range.'
    );
    return null;
  }

  return { min, max, ijkStart };
}

/**
 * Runs flood fill segmentation with intensity range, followed by island removal
 * (remove external islands, fill internal islands). Better for contiguous regions
 * with speckling than GrowCut.
 *
 * @param referencedVolumeId - The volume ID to segment
 * @param worldPosition - The clicked position in world coordinates
 * @param viewport - The viewport (required for IslandRemoval plane normalization)
 * @param options - Configuration options
 * @returns The segmented labelmap volume
 */
async function runFloodFillSegmentation({
  referencedVolumeId,
  worldPosition,
  viewport,
  options = {},
}: {
  referencedVolumeId: string;
  worldPosition: Types.Point3;
  viewport: Types.IViewport;
  options?: FloodFillSegmentationOptions;
}): Promise<Types.IImageVolume | null> {
  const referencedVolume = cache.getVolume(referencedVolumeId);
  const labelmap =
    volumeLoader.createAndCacheDerivedLabelmapVolume(referencedVolumeId);

  const segmentIndex = options.segmentIndex ?? 1;

  // Reset the labelmap
  labelmap.voxelManager.forEach(({ index, value }) => {
    if (value !== 0) {
      labelmap.voxelManager.setAtIndex(index, 0);
    }
  });

  const rangeResult = getPositiveIntensityRange(
    referencedVolume,
    worldPosition,
    options
  );

  if (!rangeResult) {
    return null;
  }

  const { min: positiveMin, max: positiveMax, ijkStart } = rangeResult;

  const { dimensions } = referencedVolume;
  const [width, height, numSlices] = dimensions;
  const scalarData = referencedVolume.voxelManager.getCompleteScalarDataArray();
  const numPixelsPerSlice = width * height;

  const intensityGetter = (
    x: number,
    y: number,
    z: number
  ): number | undefined => {
    if (
      x < 0 ||
      x >= width ||
      y < 0 ||
      y >= height ||
      z < 0 ||
      z >= numSlices
    ) {
      return undefined;
    }
    const index = z * numPixelsPerSlice + y * width + x;
    return scalarData[index];
  };

  const inRange = (val: number) => val >= positiveMin && val <= positiveMax;

  const floodedPoints: Types.Point3[] = [];
  floodFill(intensityGetter, ijkStart as [number, number, number], {
    equals: (val, _startVal) =>
      val !== undefined && typeof val === 'number' && inRange(val),
    onFlood: (x: number, y: number, z?: number) => {
      const k = z ?? ijkStart[2];
      floodedPoints.push([x, y, k]);
    },
  });

  if (floodedPoints.length === 0) {
    console.warn('Flood fill produced no voxels.');
    return labelmap;
  }

  // Write flooded voxels to labelmap
  floodedPoints.forEach(([x, y, z]) => {
    const index = z * numPixelsPerSlice + y * width + x;
    labelmap.voxelManager.setAtIndex(index, segmentIndex);
  });

  // Island removal: keep only the island containing the click, fill internal holes
  const islandRemoval = new IslandRemoval({
    maxInternalRemove: options.maxInternalRemove ?? 128,
    fillInternalEdge: false,
  });

  const ijkPoints = [ijkStart];
  const initialized = islandRemoval.initialize(
    viewport,
    labelmap.voxelManager,
    {
      points: ijkPoints,
      segmentIndex,
      previewSegmentIndex: segmentIndex,
    }
  );

  if (!initialized) {
    console.warn('Island removal initialization failed.');
    return labelmap;
  }

  islandRemoval.floodFillSegmentIsland();
  islandRemoval.removeExternalIslands();
  islandRemoval.removeInternalIslands();

  return labelmap;
}

export {
  runFloodFillSegmentation as default,
  runFloodFillSegmentation,
  getPositiveIntensityRange,
};
export type { FloodFillSegmentationOptions };
