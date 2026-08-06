import type { Types } from '@cornerstonejs/core';
import type { ViewportVoiMappingForTool } from './getViewportVoiMappingForVolume';

export type FloodFillIntensityRangeDiagnostics = {
  neighborhoodMean: number;
  neighborhoodStdDev: number;
  clickedVoxelValue: number;
  positiveStdDevMultiplier: number;
  neighborhoodRadius: number;
  strategy?: string;
  strategyMode?: 'triClass' | 'exactRange';
  mappedBand?: { min: number; max: number };
  canvasSampleCount?: number;
  /** True when luma-derived raw band missed the seed; interval was recentred on the voxel scalar. */
  canvasDiskBandCenteredOnSeed?: boolean;
  /** Canvas disk samples excluded dominant 0s (letterbox / unused canvas). */
  canvasDiskLetterboxTrimmed?: boolean;
  /** Populated by the adaptive (config-less) region strategy. */
  adaptive?: {
    /** Chosen threshold depth in display-byte units (0..255). */
    toleranceBytes: number;
    /** In-plane region size (pixels) at the chosen tolerance. */
    regionSizePx: number;
    /** In-plane region footprint (mm²) at the chosen tolerance. */
    regionAreaMm2?: number;
    /** Window-perimeter median display byte used as background estimate. */
    backgroundByte: number;
    /** Seed reference display byte (3x3 median at the snapped seed). */
    seedByte: number;
    /** +1 = region brighter than surroundings, -1 = darker. */
    polarity?: number;
    /** True when the seed moved off the clicked pixel onto higher contrast. */
    seedSnapped: boolean;
    /** Analysis window size (in-plane pixels). */
    windowSize: [number, number];
    /** Region growth change points: [toleranceLevel, regionSizePx]. */
    growthCurve?: Array<[number, number]>;
    /** Tolerance level at which the region exceeded the size cap (-1 if never). */
    explosionLevel?: number;
    /** Tolerance level at which the region first touched the window border (-1 if never). */
    borderTouchLevel?: number;
  };
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
