import { utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { NumberVoxelManager } from '@cornerstonejs/core/utilities';
import { getViewportVoiMappingForVolume } from '../getViewportVoiMappingForVolume';
import type {
  FloodFillIntensityRangeOptions,
  FloodFillIntensityRangeResult,
  GetFloodFillIntensityRange,
} from '../floodFillIntensityRangeTypes';
import { getFixedPercentMappedIntensityRange } from './fixedPercentMapped';
import { getCanvasDiskIntensityRange } from './canvasDiskIntensityRange';

const { transformWorldToIndex } = csUtils;

/** Built-in strategy ids for `RegionSegmentIntensityRangeStrategyConfig.strategy`. */
export type RegionSegmentBuiltInStrategy =
  | 'meanStdMapped'
  | 'fixedPercent5'
  | 'fixedPercent10'
  | 'canvasDiskTriClass';

/**
 * Single configuration object for Region Segment Plus intensity-range resolution.
 * Replace the whole object when switching modes so params stay consistent.
 * If `getIntensityRange` is set, it takes precedence over `strategy`.
 */
export type RegionSegmentIntensityRangeStrategyConfig = {
  strategy: RegionSegmentBuiltInStrategy;
  getIntensityRange?: GetFloodFillIntensityRange;
  /** Used when `strategy === 'canvasDiskTriClass'` (CSS pixels; matches on-screen disk). Default 3. */
  canvasDiskRadiusPx?: number;
};

const DEFAULT_INTENSITY_STRATEGY_CONFIG: RegionSegmentIntensityRangeStrategyConfig =
  {
    strategy: 'meanStdMapped',
  };

/**
 * String shorthand for `configuration.intensityRangeStrategy` (disk presets expand to
 * `canvasDiskTriClass` + radius). Prefer {@link RegionSegmentIntensityRangeStrategyConfig}.
 */
export type RegionSegmentIntensityRangeStrategy =
  | RegionSegmentBuiltInStrategy
  | 'canvasDiskTriClassSmall'
  | 'canvasDiskTriClassLarge'
  | 'canvasDiskTriClass';

/** Fragment of tool `configuration` consumed by {@link normalizeIntensityRangeStrategyConfig}. */
export type RegionSegmentIntensityRangeStrategyInput = {
  intensityRangeStrategy?:
    | RegionSegmentIntensityRangeStrategyConfig
    | RegionSegmentIntensityRangeStrategy;
};

/**
 * Returns a complete strategy object from tool configuration, or the default
 * when `intensityRangeStrategy` is missing.
 */
export function normalizeIntensityRangeStrategyConfig(
  configuration: RegionSegmentIntensityRangeStrategyInput
): RegionSegmentIntensityRangeStrategyConfig {
  const irs = configuration.intensityRangeStrategy;
  if (irs && typeof irs === 'object' && irs !== null && 'strategy' in irs) {
    const o = irs as RegionSegmentIntensityRangeStrategyConfig;
    return {
      strategy: o.strategy,
      getIntensityRange: o.getIntensityRange,
      canvasDiskRadiusPx: o.canvasDiskRadiusPx,
    };
  }

  if (typeof irs === 'string') {
    return coerceStrategyShorthandToConfig(irs);
  }

  return { ...DEFAULT_INTENSITY_STRATEGY_CONFIG };
}

function coerceStrategyShorthandToConfig(
  strategy: RegionSegmentIntensityRangeStrategy
): RegionSegmentIntensityRangeStrategyConfig {
  if (strategy === 'canvasDiskTriClassLarge') {
    return { strategy: 'canvasDiskTriClass', canvasDiskRadiusPx: 10 };
  }
  if (
    strategy === 'canvasDiskTriClassSmall' ||
    strategy === 'canvasDiskTriClass'
  ) {
    return { strategy: 'canvasDiskTriClass', canvasDiskRadiusPx: 3 };
  }
  return { strategy: strategy as RegionSegmentBuiltInStrategy };
}

export function getCanvasDiskRadiusCssPxFromConfig(
  config: RegionSegmentIntensityRangeStrategyConfig
): number | undefined {
  if (config.strategy !== 'canvasDiskTriClass') {
    return undefined;
  }
  return config.canvasDiskRadiusPx ?? 3;
}

function makeCanvasDiskGetter(
  canvasDiskRadiusPx: number
): GetFloodFillIntensityRange {
  return (referencedVolume, worldPosition, options) => {
    if (!options?.viewport || options.canvasPoint === undefined) {
      return null;
    }
    const voi =
      options.voiMapping ??
      (options.referencedVolumeId
        ? getViewportVoiMappingForVolume(
            options.viewport,
            options.referencedVolumeId
          )
        : null);
    if (!voi) {
      return null;
    }
    return getCanvasDiskIntensityRange(referencedVolume, worldPosition, {
      viewport: options.viewport,
      canvasPoint: options.canvasPoint,
      canvasDiskRadiusPx,
      voi,
      worldPosition,
    });
  };
}

const fixedPercent5Getter: GetFloodFillIntensityRange = (
  referencedVolume,
  worldPosition,
  options
) => {
  const voi =
    options?.voiMapping ??
    (options?.viewport && options?.referencedVolumeId
      ? getViewportVoiMappingForVolume(
          options.viewport,
          options.referencedVolumeId
        )
      : null);
  if (voi) {
    return getFixedPercentMappedIntensityRange(
      referencedVolume,
      worldPosition,
      5,
      voi,
      options
    );
  }
  return getFixedPercentRawFallback(
    referencedVolume,
    worldPosition,
    5,
    options
  );
};

const fixedPercent10Getter: GetFloodFillIntensityRange = (
  referencedVolume,
  worldPosition,
  options
) => {
  const voi =
    options?.voiMapping ??
    (options?.viewport && options?.referencedVolumeId
      ? getViewportVoiMappingForVolume(
          options.viewport,
          options.referencedVolumeId
        )
      : null);
  if (voi) {
    return getFixedPercentMappedIntensityRange(
      referencedVolume,
      worldPosition,
      10,
      voi,
      options
    );
  }
  return getFixedPercentRawFallback(
    referencedVolume,
    worldPosition,
    10,
    options
  );
};

/**
 * Resolved getter from normalized config: custom function wins, then built-in by `strategy`.
 */
export function resolveIntensityRangeGetterFromConfig(
  config: RegionSegmentIntensityRangeStrategyConfig
): GetFloodFillIntensityRange | undefined {
  if (config.getIntensityRange) {
    return config.getIntensityRange;
  }
  switch (config.strategy) {
    case 'meanStdMapped':
      return undefined;
    case 'fixedPercent5':
      return fixedPercent5Getter;
    case 'fixedPercent10':
      return fixedPercent10Getter;
    case 'canvasDiskTriClass': {
      const r = config.canvasDiskRadiusPx ?? 3;
      return makeCanvasDiskGetter(r);
    }
    default:
      return undefined;
  }
}

function getFixedPercentRawFallback(
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  percent: number,
  options?: FloodFillIntensityRangeOptions
): FloodFillIntensityRangeResult | null {
  const { dimensions, imageData: refImageData } = referencedVolume;
  const [width, height, numSlices] = dimensions;
  const vm = referencedVolume.voxelManager as NumberVoxelManager;
  const [volMin, volMax] = vm.getRange();
  const span = volMax - volMin || 1;

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
    return null;
  }

  const startValue = Number(vm.getAtIJKPoint(ijkStart));
  const half = (percent / 100) * span;
  let rawMin = startValue - half;
  let rawMax = startValue + half;
  rawMin = Math.max(volMin, Math.min(volMax, rawMin));
  rawMax = Math.max(volMin, Math.min(volMax, rawMax));
  if (rawMin > rawMax) {
    const t = rawMin;
    rawMin = rawMax;
    rawMax = t;
  }

  if (startValue < rawMin || startValue > rawMax) {
    return null;
  }

  return {
    min: rawMin,
    max: rawMax,
    ijkStart,
    diagnostics: {
      neighborhoodMean: startValue,
      neighborhoodStdDev: 0,
      clickedVoxelValue: startValue,
      positiveStdDevMultiplier: percent,
      neighborhoodRadius: options?.initialNeighborhoodRadius ?? 0,
      strategy: 'fixedPercentRawFallback',
    },
  };
}

/**
 * @deprecated Use {@link resolveIntensityRangeGetterFromConfig} with
 * {@link normalizeIntensityRangeStrategyConfig}.
 */
export function getIntensityRangeGetterForStrategy(
  strategy: RegionSegmentIntensityRangeStrategy
): GetFloodFillIntensityRange | undefined {
  return resolveIntensityRangeGetterFromConfig(
    coerceStrategyShorthandToConfig(strategy)
  );
}

/**
 * @deprecated Use {@link getCanvasDiskRadiusCssPxFromConfig} with normalized config.
 */
export function getCanvasDiskRadiusPxForStrategy(
  strategy: RegionSegmentIntensityRangeStrategy | undefined
): number | undefined {
  if (strategy === undefined) {
    return undefined;
  }
  return getCanvasDiskRadiusCssPxFromConfig(
    coerceStrategyShorthandToConfig(strategy)
  );
}
