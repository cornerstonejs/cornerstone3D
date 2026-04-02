import type { Types } from '@cornerstonejs/core';
import type { ViewportVoiMappingForTool } from './getViewportVoiMappingForVolume';

export type FloodFillIntensityRangeDiagnostics = {
  neighborhoodMean: number;
  neighborhoodStdDev: number;
  clickedVoxelValue: number;
  positiveStdDevMultiplier: number;
  neighborhoodRadius: number;
  strategy?: string;
  mappedBand?: { min: number; max: number };
  canvasSampleCount?: number;
  /** True when luma-derived raw band missed the seed; interval was recentred on the voxel scalar. */
  canvasDiskBandCenteredOnSeed?: boolean;
};

export type FloodFillIntensityRangeResult = {
  min: number;
  max: number;
  ijkStart: Types.Point3;
  diagnostics: FloodFillIntensityRangeDiagnostics;
};

export type FloodFillIntensityRangeOptions = {
  positiveStdDevMultiplier?: number;
  initialNeighborhoodRadius?: number;
  /** When set, neighborhood stats use mapped intensities and band is inversed to raw. */
  voiMapping?: ViewportVoiMappingForTool | null;
  viewport?: Types.IViewport;
  element?: HTMLDivElement;
  referencedVolumeId?: string;
  canvasPoint?: { x: number; y: number };
  canvasDiskRadiusPx?: number;
};

export type GetFloodFillIntensityRange = (
  referencedVolume: Types.IImageVolume,
  worldPosition: Types.Point3,
  options?: FloodFillIntensityRangeOptions
) => FloodFillIntensityRangeResult | null;
