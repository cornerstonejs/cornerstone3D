import type { Types } from '@cornerstonejs/core';
import type { NumberVoxelManager } from '@cornerstonejs/core/utilities';
import { utilities as csUtils } from '@cornerstonejs/core';
import type { ViewportVoiMappingForTool } from '../getViewportVoiMappingForVolume';
import type {
  FloodFillIntensityRangeResult,
  FloodFillIntensityRangeOptions,
} from '../floodFillIntensityRangeTypes';

const {
  transformWorldToIndex,
  mapScalarToViewportVoiIntensity,
  mapMappedBandToRawRange,
} = csUtils;

export function getFixedPercentMappedIntensityRange(
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  percent: number,
  voi: ViewportVoiMappingForTool,
  options?: FloodFillIntensityRangeOptions
): FloodFillIntensityRangeResult | null {
  const { dimensions, imageData: refImageData } = referencedVolume;
  const [width, height, numSlices] = dimensions;
  const referenceVolumeVoxelManager =
    referencedVolume.voxelManager as NumberVoxelManager;

  const neighborhoodRadius = options?.initialNeighborhoodRadius ?? 0;

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

  const startValue = Number(
    referenceVolumeVoxelManager.getAtIJKPoint(ijkStart)
  );
  const y0 = mapScalarToViewportVoiIntensity(startValue, voi);
  const half = percent / 100;
  let yMin = y0 - half;
  let yMax = y0 + half;
  yMin = Math.max(0, Math.min(1, yMin));
  yMax = Math.max(0, Math.min(1, yMax));
  if (yMin > yMax) {
    const t = yMin;
    yMin = yMax;
    yMax = t;
  }

  const { rawMin, rawMax } = mapMappedBandToRawRange(yMin, yMax, voi);
  const bandLo = Math.min(rawMin, rawMax);
  const bandHi = Math.max(rawMin, rawMax);
  // Sigmoid inverse clamps mapped 0/1 to Y_EPS; near-saturated clicks can then sit
  // outside [bandLo, bandHi] even though y0 ∈ [yMin, yMax]. Always include seed.
  const min = Math.min(bandLo, startValue);
  const max = Math.max(bandHi, startValue);

  return {
    min,
    max,
    ijkStart,
    diagnostics: {
      neighborhoodMean: y0,
      neighborhoodStdDev: 0,
      clickedVoxelValue: startValue,
      positiveStdDevMultiplier: percent,
      neighborhoodRadius,
      strategy: 'fixedPercentMapped',
      mappedBand: { min: yMin, max: yMax },
    },
  };
}
