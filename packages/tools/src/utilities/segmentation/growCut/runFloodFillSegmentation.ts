import { utilities as csUtils, cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { NumberVoxelManager } from '@cornerstonejs/core/utilities';
import floodFill from '../floodFill';
import IslandRemoval from '../islandRemoval';
import { createEnsureSliceLoadedForVolume } from '../createEnsureSliceLoadedForVolume';
import {
  DEFAULT_NEIGHBORHOOD_RADIUS,
  DEFAULT_POSITIVE_STD_DEV_MULTIPLIER,
} from './constants';
import { getViewportVoiMappingForVolume } from './getViewportVoiMappingForVolume';
import { getCanvasDiskIntensityRange } from './intensityRange/canvasDiskIntensityRange';
import type {
  FloodFillIntensityRangeResult,
  FloodFillIntensityRangeOptions,
  GetFloodFillIntensityRange,
} from './floodFillIntensityRangeTypes';

const {
  transformWorldToIndex,
  mapScalarToViewportVoiIntensity,
  mapMappedBandToRawRange,
} = csUtils;
const { growCutLog: log } = csUtils.logger;

export type {
  FloodFillIntensityRangeResult,
  FloodFillIntensityRangeOptions,
  GetFloodFillIntensityRange,
} from './floodFillIntensityRangeTypes';

/** Ref-volume metadata + labelmap dimension check. */
const FLOOD_FILL_PREP_TIMING_LABEL = 'cornerstone.tools: floodFill: prep';
const FLOOD_FILL_PREP_REF_META =
  'cornerstone.tools: floodFill: prep: ref_volume_meta';
const FLOOD_FILL_RANGE_TIMING_LABEL =
  'cornerstone.tools: floodFill: intensityRange';
const FLOOD_FILL_RUN_TIMING_LABEL =
  'cornerstone.tools: floodFill: fillAndIslandRemoval';

type FloodFillSegmentationOptions = {
  positiveStdDevMultiplier?: number;
  initialNeighborhoodRadius?: number;
  segmentIndex?: number;
  /**
   * Segment value written during the async flood (e.g. 255) so the active labelmap
   * can update slice-by-slice. After island removal, those voxels are promoted to
   * {@link segmentIndex}. Omit to use 255 when `segmentIndex !== 255`, or set equal
   * to `segmentIndex` to disable preview and paint the final index immediately.
   */
  floodPreviewSegmentIndex?: number;
  maxInternalRemove?: number;
  /**
   * When true (default), run planar island flood from the click then clear voxels
   * not marked ISLAND. Set false to keep the raw 3D flood fill result.
   */
  applyExternalIslandRemoval?: boolean;
  /**
   * When true (default), run internal hole / speckle cleanup after external removal.
   * Ignored if applyExternalIslandRemoval is false (nothing to clean in-labelmap).
   */
  applyInternalIslandRemoval?: boolean;
  /** Forwarded to IslandRemoval: logs bounds, per-click flood, and voxel counts. */
  islandRemovalVerboseLogging?: boolean;
  getIntensityRange?: GetFloodFillIntensityRange;
  /** Viewport container; passed into `getIntensityRange` / canvas-disk strategy. */
  element?: HTMLDivElement;
  /** Pointer position in viewport canvas coordinates (same space as `canvasDiskRadiusPx`). */
  canvasPoint?: { x: number; y: number };
  /** Circular sampling ROI radius in canvas pixels (see tool `intensitySamplingDiskRadiusCanvasPx`). */
  intensitySamplingDiskRadiusCanvasPx?: number;
  /**
   * 3D: load slice images on demand (streaming volumes). Built from volume when omitted.
   */
  ensureSliceLoaded?: (sliceIndex: number) => Promise<void>;
  yieldEvery?: number;
  /**
   * When true, forwarded to {@link floodFill} as `planar` (same acquisition slice as seed, fixed k).
   */
  planar?: boolean;
};

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
 * Raw neighborhood mean ± kσ (no VOI mapping).
 */
function getPositiveIntensityRangeRaw(
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
    initialStats.mean = seedScalar;
    initialStats.stdDev = 0;
  }

  const min = initialStats.mean - positiveK * initialStats.stdDev;
  const max = initialStats.mean + positiveK * initialStats.stdDev;
  const startValue = referenceVolumeVoxelManager.getAtIJKPoint(ijkStart);

  if (startValue < min || startValue > max) {
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
      strategy: 'meanStdRaw',
    },
  };
}

/**
 * Neighborhood mean ± kσ in VOI-mapped [0,1] space, band inverted to raw bounds.
 */
function getPositiveIntensityRangeVoiMapped(
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  voiMapping: NonNullable<FloodFillIntensityRangeOptions['voiMapping']>,
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

  if (
    ijkStart[0] < 0 ||
    ijkStart[0] >= width ||
    ijkStart[1] < 0 ||
    ijkStart[1] >= height ||
    ijkStart[2] < 0 ||
    ijkStart[2] >= numSlices
  ) {
    log.info('intensity range (VOI-mapped): click outside volume', {
      ijkStart,
      dimensions: [width, height, numSlices],
    });
    return null;
  }

  const mapFn = (v: number) => mapScalarToViewportVoiIntensity(v, voiMapping);

  const initialStats = csUtils.calculateNeighborhoodStats(
    referenceVolumeVoxelManager,
    dimensions,
    ijkStart,
    neighborhoodRadius,
    mapFn
  );

  if (initialStats.count === 0) {
    const seedScalar = Number(
      referenceVolumeVoxelManager.getAtIJKPoint(ijkStart)
    );
    initialStats.mean = mapFn(seedScalar);
    initialStats.stdDev = 0;
  }

  let yMin = initialStats.mean - positiveK * initialStats.stdDev;
  let yMax = initialStats.mean + positiveK * initialStats.stdDev;
  yMin = Math.max(0, Math.min(1, yMin));
  yMax = Math.max(0, Math.min(1, yMax));
  if (yMin > yMax) {
    const t = yMin;
    yMin = yMax;
    yMax = t;
  }

  const { rawMin, rawMax } = mapMappedBandToRawRange(yMin, yMax, voiMapping);
  const startValue = Number(
    referenceVolumeVoxelManager.getAtIJKPoint(ijkStart)
  );
  const bandLo = Math.min(rawMin, rawMax);
  const bandHi = Math.max(rawMin, rawMax);
  const min = Math.min(bandLo, startValue);
  const max = Math.max(bandHi, startValue);

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
      strategy: 'meanStdVoiMapped',
      mappedBand: { min: yMin, max: yMax },
    },
  };
}

function getPositiveIntensityRange(
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  options?: FloodFillIntensityRangeOptions
): FloodFillIntensityRangeResult | null {
  if (options?.voiMapping) {
    return getPositiveIntensityRangeVoiMapped(
      referencedVolume,
      worldPosition,
      options.voiMapping,
      options
    );
  }
  return getPositiveIntensityRangeRaw(referencedVolume, worldPosition, options);
}

function resolveIntensityRange(
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  viewport: Types.IViewport,
  referencedVolumeId: string,
  options: FloodFillSegmentationOptions,
  rangeContext: FloodFillIntensityRangeOptions
): FloodFillIntensityRangeResult | null {
  if (options.getIntensityRange) {
    const fromGetter = options.getIntensityRange(
      referencedVolume,
      worldPosition,
      rangeContext
    );
    if (!fromGetter) {
      log.warn(
        'flood fill intensity range: strategy/custom getIntensityRange returned null (e.g. missing canvasPoint/VOI for canvas-disk, click outside volume, or fixed-% rejection)',
        { referencedVolumeId, worldPosition }
      );
    }
    return fromGetter;
  }
  const voiFromViewport = getViewportVoiMappingForVolume(
    viewport,
    referencedVolumeId
  );
  const merged: FloodFillIntensityRangeOptions = {
    ...rangeContext,
    voiMapping: voiFromViewport ?? undefined,
  };
  let result = getPositiveIntensityRange(
    referencedVolume,
    worldPosition,
    merged
  );
  if (!result && merged.voiMapping) {
    log.info(
      'flood fill intensity range: VOI-mapped mean±σ failed; falling back to raw mean±σ',
      { referencedVolumeId }
    );
    result = getPositiveIntensityRange(referencedVolume, worldPosition, {
      ...merged,
      voiMapping: undefined,
    });
  }
  if (!result) {
    log.warn(
      'flood fill intensity range: default mean±σ (VOI + raw fallback) could not resolve a band',
      { referencedVolumeId, worldPosition }
    );
  }
  return result;
}

function assertFloodFillLabelmapMatchesRef(
  referencedVolume: Types.IImageVolume,
  labelmapVolume: Types.IImageVolume
) {
  const [rw, rh, rd] = referencedVolume.dimensions;
  const [lw, lh, ld] = labelmapVolume.dimensions;
  if (rw !== lw || rh !== lh || rd !== ld) {
    throw new Error(
      `runFloodFillSegmentation: labelmap dimensions [${lw},${lh},${ld}] must match referenced volume [${rw},${rh},${rd}]`
    );
  }
}

function resolveFloodPaintIndices(
  segmentIndex: number,
  explicitPreview?: number
): { paintIndex: number; usePreview: boolean } {
  if (explicitPreview !== undefined) {
    return {
      paintIndex: explicitPreview,
      usePreview: explicitPreview !== segmentIndex,
    };
  }
  if (segmentIndex === 255) {
    return { paintIndex: 255, usePreview: false };
  }
  return { paintIndex: 255, usePreview: true };
}

function promotePreviewSegmentToFinal(
  voxelManager: NumberVoxelManager,
  preview: number,
  final: number
) {
  voxelManager.forEach(({ value, index }) => {
    if (value === preview) {
      voxelManager.setAtIndex(index, final);
    }
  });
}

async function runFloodFillSegmentation({
  referencedVolumeId,
  worldPosition,
  viewport,
  labelmapVolume,
  options = {},
}: {
  referencedVolumeId: string;
  worldPosition: Types.Point3;
  viewport: Types.IViewport;
  /** Active segmentation labelmap (same grid as referenced volume). */
  labelmapVolume: Types.IImageVolume;
  options?: FloodFillSegmentationOptions;
}): Promise<Types.IImageVolume | null> {
  console.time(FLOOD_FILL_PREP_TIMING_LABEL);

  const referencedVolume = cache.getVolume(referencedVolumeId);
  assertFloodFillLabelmapMatchesRef(referencedVolume, labelmapVolume);
  const labelmap = labelmapVolume;

  const segmentIndex = options.segmentIndex ?? 1;
  const { paintIndex, usePreview } = resolveFloodPaintIndices(
    segmentIndex,
    options.floodPreviewSegmentIndex
  );

  console.time(FLOOD_FILL_PREP_REF_META);
  const [volMin, volMax] = referencedVolume.voxelManager.getRange();
  const displayVoi = getDisplayVoiSnapshot(viewport, referencedVolumeId);
  log.info('segmentation path: flood fill (floodfill_full)', {
    referencedVolumeId,
    volumeScalarRange: { min: volMin, max: volMax },
    displayVoi,
    floodPreview: usePreview ? paintIndex : null,
    segmentIndex,
  });
  console.timeEnd(FLOOD_FILL_PREP_REF_META);

  console.timeEnd(FLOOD_FILL_PREP_TIMING_LABEL);

  const voiMapping = getViewportVoiMappingForVolume(
    viewport,
    referencedVolumeId
  );

  const rangeContext: FloodFillIntensityRangeOptions = {
    positiveStdDevMultiplier: options.positiveStdDevMultiplier,
    initialNeighborhoodRadius: options.initialNeighborhoodRadius,
    viewport,
    element: options.element,
    referencedVolumeId,
    canvasPoint: options.canvasPoint,
    canvasDiskRadiusPx: options.intensitySamplingDiskRadiusCanvasPx,
    voiMapping: voiMapping ?? undefined,
  };

  console.time(FLOOD_FILL_RANGE_TIMING_LABEL);
  const rangeResult = resolveIntensityRange(
    referencedVolume,
    worldPosition,
    viewport,
    referencedVolumeId,
    options,
    rangeContext
  );
  console.timeEnd(FLOOD_FILL_RANGE_TIMING_LABEL);

  if (!rangeResult) {
    log.warn('flood fill: aborted before fill (no intensity range)', {
      referencedVolumeId,
      worldPosition,
    });
    return null;
  }

  const { min: rangeMin, max: rangeMax, ijkStart, diagnostics } = rangeResult;

  log.info('intensity tolerance band', {
    toleranceMin: rangeMin,
    toleranceMax: rangeMax,
    width: rangeMax - rangeMin,
    ...diagnostics,
  });
  console.info('[cornerstone-tools] flood fill intensity range', {
    rawMin: rangeMin,
    rawMax: rangeMax,
    strategy: diagnostics.strategy,
    mappedBand: diagnostics.mappedBand,
    neighborhoodRadius: diagnostics.neighborhoodRadius,
  });

  console.time(FLOOD_FILL_RUN_TIMING_LABEL);
  try {
    const { dimensions } = referencedVolume;
    const [width, height, numSlices] = dimensions;
    const refVoxelManager = referencedVolume.voxelManager as NumberVoxelManager;
    const numPixelsPerSlice = width * height;

    let positiveMin = rangeMin;
    let positiveMax = rangeMax;
    const seedScalar = Number(refVoxelManager.getAtIJKPoint(ijkStart));
    if (Number.isFinite(seedScalar)) {
      if (seedScalar < positiveMin) {
        log.info('flood fill: expanded tolerance min to include seed voxel', {
          seedScalar,
          previousMin: positiveMin,
        });
        positiveMin = seedScalar;
      }
      if (seedScalar > positiveMax) {
        log.info('flood fill: expanded tolerance max to include seed voxel', {
          seedScalar,
          previousMax: positiveMax,
        });
        positiveMax = seedScalar;
      }
    }
    console.info('[cornerstone-tools] flood fill seed + effective tolerance', {
      seedScalar,
      effectiveMin: positiveMin,
      effectiveMax: positiveMax,
    });

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
    const ensureSliceLoaded =
      options.ensureSliceLoaded ??
      createEnsureSliceLoadedForVolume(referencedVolume);

    const planar = options.planar === true;

    if (planar) {
      log.info('flood fill: planar mode (fixed slice index k)', { ijkStart });
    }

    await floodFill(intensityGetter, ijkStart as [number, number, number], {
      equals: (val, _startVal) =>
        val !== undefined && typeof val === 'number' && inRange(val),
      onFlood: (x: number, y: number, z?: number) => {
        const k = z ?? ijkStart[2];
        floodedPoints.push([x, y, k]);
        const index = k * numPixelsPerSlice + y * width + x;
        labelmap.voxelManager.setAtIndex(index, paintIndex);
      },
      planar,
      ensureSliceLoaded,
      yieldEvery: options.yieldEvery ?? 500,
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
      paintIndex,
      usePreview,
    });

    const applyExternal = options.applyExternalIslandRemoval !== false;
    const applyInternal =
      options.applyInternalIslandRemoval !== false && applyExternal;
    const islandVerbose = options.islandRemovalVerboseLogging === true;

    const islandRemoval = new IslandRemoval({
      maxInternalRemove: options.maxInternalRemove ?? 128,
      fillInternalEdge: false,
      verboseLogging: islandVerbose,
    });

    const ijkPoints = [ijkStart];
    const initialized = islandRemoval.initialize(
      viewport,
      labelmap.voxelManager,
      {
        points: ijkPoints,
        segmentIndex,
        previewSegmentIndex: usePreview ? paintIndex : segmentIndex,
      }
    );

    if (!initialized) {
      log.info('island removal: initialize failed', { segmentIndex, ijkStart });
      console.warn('Island removal initialization failed.');
      if (usePreview) {
        promotePreviewSegmentToFinal(
          labelmap.voxelManager as NumberVoxelManager,
          paintIndex,
          segmentIndex
        );
      }
      return labelmap;
    }

    let islandFloodVoxels = 0;
    let externalClearedVoxels = 0;
    let internalSliceCount: number | undefined;

    if (applyExternal) {
      islandFloodVoxels = islandRemoval.floodFillSegmentIsland();
      externalClearedVoxels = islandRemoval.removeExternalIslands();
      if (applyInternal) {
        const modifiedSlices = islandRemoval.removeInternalIslands();
        internalSliceCount = modifiedSlices?.length;
      }
    }

    log.info('island removal: complete', {
      segmentIndex,
      applyExternalIslandRemoval: applyExternal,
      applyInternalIslandRemoval: applyInternal,
      floodedPointsBeforeIsland: floodedPoints.length,
      islandFloodVoxelsFromSegmentSet: islandFloodVoxels,
      externalIslandClearVoxels: externalClearedVoxels,
      internalRemovalModifiedSlices: internalSliceCount,
      islandRemovalVerboseLogging: islandVerbose,
    });

    if (usePreview) {
      promotePreviewSegmentToFinal(
        labelmap.voxelManager as NumberVoxelManager,
        paintIndex,
        segmentIndex
      );
    }

    return labelmap;
  } finally {
    console.timeEnd(FLOOD_FILL_RUN_TIMING_LABEL);
  }
}

export {
  runFloodFillSegmentation as default,
  runFloodFillSegmentation,
  getPositiveIntensityRange,
  getPositiveIntensityRangeRaw,
  getPositiveIntensityRangeVoiMapped,
  getDisplayVoiSnapshot,
};
export type { FloodFillSegmentationOptions };
