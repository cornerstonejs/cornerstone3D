import { utilities as csUtils, cache, volumeLoader } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { NumberVoxelManager } from '@cornerstonejs/core/utilities';
import floodFill from '../floodFill';
import IslandRemoval from '../islandRemoval';
import {
  DEFAULT_NEIGHBORHOOD_RADIUS,
  DEFAULT_POSITIVE_STD_DEV_MULTIPLIER,
} from './constants';

const { transformWorldToIndex } = csUtils;
const { growCutLog: log } = csUtils.logger;

/** Derived labelmap creation, ref-volume getRange(), and zeroing the full labelmap. */
const FLOOD_FILL_PREP_TIMING_LABEL = 'cornerstone.tools: floodFill: prep';
/** Neighborhood band only (excludes prep and full scalar-array access). */
const FLOOD_FILL_RANGE_TIMING_LABEL =
  'cornerstone.tools: floodFill: intensityRange';
/** Scalar access, flood fill, labelmap write, island removal. */
const FLOOD_FILL_RUN_TIMING_LABEL =
  'cornerstone.tools: floodFill: fillAndIslandRemoval';

/** Result of computing the scalar intensity band used as the flood-fill predicate. */
type FloodFillIntensityRangeResult = {
  min: number;
  max: number;
  ijkStart: Types.Point3;
  diagnostics: {
    neighborhoodMean: number;
    neighborhoodStdDev: number;
    clickedVoxelValue: number;
    positiveStdDevMultiplier: number;
    neighborhoodRadius: number;
  };
};

/** Options passed to the default or custom flood-fill range function. */
type FloodFillIntensityRangeOptions = {
  positiveStdDevMultiplier?: number;
  initialNeighborhoodRadius?: number;
};

/**
 * Pluggable range for flood fill: return { min, max, ijkStart, diagnostics }
 * or null when the seed is invalid (same contract as getPositiveIntensityRange).
 */
type GetFloodFillIntensityRange = (
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  options?: FloodFillIntensityRangeOptions
) => FloodFillIntensityRangeResult | null;

type FloodFillSegmentationOptions = {
  positiveStdDevMultiplier?: number;
  initialNeighborhoodRadius?: number;
  segmentIndex?: number;
  maxInternalRemove?: number;
  /**
   * Replace the default neighborhood mean ± k·σ band. Implementations may
   * delegate to getPositiveIntensityRange for the baseline behavior.
   */
  getIntensityRange?: GetFloodFillIntensityRange;
};

/**
 * Display VOI (window/level) from the viewport when available — algorithm uses raw
 * voxel intensities, so compare this to the intensity tolerance range when debugging.
 */
function getDisplayVoiSnapshot(
  viewport: Types.IViewport,
  referencedVolumeId?: string
): {
  lower: number;
  upper: number;
  windowWidth: number;
  windowCenter: number;
} | null {
  const getProps = (
    viewport as Types.IViewport & {
      getProperties?: (volumeId?: string) => {
        voiRange?: { lower: number; upper: number };
      };
    }
  ).getProperties;
  if (typeof getProps !== 'function') {
    return null;
  }
  const props = referencedVolumeId
    ? getProps.call(viewport, referencedVolumeId)
    : getProps.call(viewport);
  const voiRange = props?.voiRange;
  if (
    !voiRange ||
    typeof voiRange.lower !== 'number' ||
    typeof voiRange.upper !== 'number'
  ) {
    return null;
  }
  const { lower, upper } = voiRange;
  return {
    lower,
    upper,
    windowWidth: upper - lower,
    windowCenter: (lower + upper) / 2,
  };
}

/**
 * Computes the positive intensity range [min, max] from a click position using
 * neighborhood statistics. Reuses the same logic as calculateGrowCutSeeds.
 */
function getPositiveIntensityRange(
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  options?: FloodFillIntensityRangeOptions
): FloodFillIntensityRangeResult | null {
  const { dimensions, imageData: refImageData } = referencedVolume;
  const [width, height, numSlices] = dimensions;
  const referenceVolumeVoxelManager =
    referencedVolume.voxelManager as NumberVoxelManager;

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
    log.info('intensity range: click outside volume', {
      ijkStart,
      dimensions: [width, height, numSlices],
    });
    console.warn('Click position is outside volume bounds.');
    return null;
  }

  const cubeSide = 2 * neighborhoodRadius + 1;
  const fullCubeVoxelCount = cubeSide ** 3;

  log.info('flood fill: computing initial intensity band from neighborhood', {
    volumeId: referencedVolume.volumeId,
    worldPosition,
    seedIjk: [...ijkStart],
    startLinearIndex: startIndex,
    dimensions: [width, height, numSlices],
    neighborhoodRadiusVoxels: neighborhoodRadius,
    neighborhoodShape: `${cubeSide}×${cubeSide}×${cubeSide} (max ${fullCubeVoxelCount} voxels; fewer at volume edges)`,
    positiveStdDevMultiplier: positiveK,
    formula: `[mean − ${positiveK}×σ, mean + ${positiveK}×σ]`,
  });

  const initialStats = csUtils.calculateNeighborhoodStats(
    referenceVolumeVoxelManager,
    dimensions,
    ijkStart,
    neighborhoodRadius
  );

  if (initialStats.count === 0) {
    const seedScalar = Number(
      referenceVolumeVoxelManager.getAtIJKPoint(ijkStart)
    );
    log.info(
      'flood fill: neighborhood stats had zero samples; using click voxel only',
      {
        fallbackMeanAndStdDevFrom: 'single voxel at seed',
        scalarAtSeed: seedScalar,
      }
    );
    initialStats.mean = seedScalar;
    initialStats.stdDev = 0;
  } else {
    log.info('flood fill: neighborhood statistics (raw)', {
      voxelCountUsed: initialStats.count,
      fullCubeVoxelCount,
      neighborhoodClippedByVolumeBounds:
        initialStats.count < fullCubeVoxelCount,
      mean: initialStats.mean,
      stdDev: initialStats.stdDev,
      coefficientOfVariation:
        initialStats.mean !== 0
          ? initialStats.stdDev / Math.abs(initialStats.mean)
          : null,
    });
  }

  const min = initialStats.mean - positiveK * initialStats.stdDev;
  const max = initialStats.mean + positiveK * initialStats.stdDev;
  const halfWidth = positiveK * initialStats.stdDev;

  const startValue = referenceVolumeVoxelManager.getAtIJKPoint(ijkStart);
  const deltaFromMean = startValue - initialStats.mean;
  const signedStdDevUnits =
    initialStats.stdDev > 1e-12 ? deltaFromMean / initialStats.stdDev : null;

  log.info('flood fill: derived tolerance band before click check', {
    toleranceMin: min,
    toleranceMax: max,
    bandHalfWidth: halfWidth,
    bandWidth: max - min,
    clickedVoxelValue: startValue,
    clickDeltaFromNeighborhoodMean: deltaFromMean,
    clickDistanceFromMeanInSigma: signedStdDevUnits,
    clickInsideBand:
      startValue >= min && startValue <= max
        ? true
        : startValue < min
          ? 'below_min'
          : 'above_max',
  });

  if (startValue < min || startValue > max) {
    log.info('intensity range: clicked voxel outside local tolerance band', {
      clickedVoxelValue: startValue,
      toleranceMin: min,
      toleranceMax: max,
      neighborhoodMean: initialStats.mean,
      neighborhoodStdDev: initialStats.stdDev,
      positiveStdDevMultiplier: positiveK,
    });
    console.warn(
      'Clicked voxel intensity is outside the calculated positive range.'
    );
    return null;
  }

  return {
    min,
    max,
    ijkStart,
    diagnostics: {
      neighborhoodMean: initialStats.mean,
      neighborhoodStdDev: initialStats.stdDev,
      clickedVoxelValue: startValue,
      positiveStdDevMultiplier: positiveK,
      neighborhoodRadius,
    },
  };
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
  console.time(FLOOD_FILL_PREP_TIMING_LABEL);
  const referencedVolume = cache.getVolume(referencedVolumeId);
  const labelmap =
    volumeLoader.createAndCacheDerivedLabelmapVolume(referencedVolumeId);

  const segmentIndex = options.segmentIndex ?? 1;

  const [volMin, volMax] = referencedVolume.voxelManager.getRange();
  const displayVoi = getDisplayVoiSnapshot(viewport, referencedVolumeId);
  log.info('segmentation path: flood fill (floodfill_full)', {
    referencedVolumeId,
    volumeScalarRange: { min: volMin, max: volMax },
    displayVoi,
  });

  // Reset the labelmap
  labelmap.voxelManager.forEach(({ index, value }) => {
    if (value !== 0) {
      labelmap.voxelManager.setAtIndex(index, 0);
    }
  });
  console.timeEnd(FLOOD_FILL_PREP_TIMING_LABEL);

  const rangeContext: FloodFillIntensityRangeOptions = {
    positiveStdDevMultiplier: options.positiveStdDevMultiplier,
    initialNeighborhoodRadius: options.initialNeighborhoodRadius,
  };

  console.time(FLOOD_FILL_RANGE_TIMING_LABEL);
  const rangeResult = options.getIntensityRange
    ? options.getIntensityRange(referencedVolume, worldPosition, rangeContext)
    : getPositiveIntensityRange(referencedVolume, worldPosition, rangeContext);
  console.timeEnd(FLOOD_FILL_RANGE_TIMING_LABEL);

  if (!rangeResult) {
    return null;
  }

  const {
    min: positiveMin,
    max: positiveMax,
    ijkStart,
    diagnostics,
  } = rangeResult;

  log.info('intensity tolerance band (from neighborhood stats)', {
    toleranceMin: positiveMin,
    toleranceMax: positiveMax,
    width: positiveMax - positiveMin,
    ...diagnostics,
    note: 'Segmentation includes voxels in [toleranceMin, toleranceMax]; display window is independent.',
  });

  console.time(FLOOD_FILL_RUN_TIMING_LABEL);
  try {
    const { dimensions } = referencedVolume;
    const [width, height, numSlices] = dimensions;
    const refVoxelManager = referencedVolume.voxelManager as NumberVoxelManager;
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
      return refVoxelManager.getAtIJK(x, y, z);
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
      log.info(
        'flood fill: zero voxels (range may be too tight or seed isolated)',
        {
          ijkStart,
          toleranceMin: positiveMin,
          toleranceMax: positiveMax,
        }
      );
      console.warn('Flood fill produced no voxels.');
      return labelmap;
    }

    log.info('flood fill: complete', {
      voxelCount: floodedPoints.length,
      ijkStart,
    });

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
      log.info('island removal: initialize failed', { segmentIndex, ijkStart });
      console.warn('Island removal initialization failed.');
      return labelmap;
    }

    islandRemoval.floodFillSegmentIsland();
    islandRemoval.removeExternalIslands();
    islandRemoval.removeInternalIslands();

    log.info(
      'island removal: complete (keep island at click, drop external, fill holes)',
      {
        segmentIndex,
      }
    );

    return labelmap;
  } finally {
    console.timeEnd(FLOOD_FILL_RUN_TIMING_LABEL);
  }
}

export {
  runFloodFillSegmentation as default,
  runFloodFillSegmentation,
  getPositiveIntensityRange,
  getDisplayVoiSnapshot,
};
export type {
  FloodFillSegmentationOptions,
  FloodFillIntensityRangeResult,
  FloodFillIntensityRangeOptions,
  GetFloodFillIntensityRange,
};
