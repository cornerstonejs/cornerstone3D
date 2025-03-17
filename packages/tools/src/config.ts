import type { ContourSegmentationData } from './types';
import type { Types } from '@cornerstonejs/core';
import type { LabelmapSegmentationData } from './types/LabelmapTypes';
import type { SurfaceSegmentationData } from './types/SurfaceTypes';
import type SegmentationRepresentations from './enums/SegmentationRepresentations';

/**
 * Options for converting between segmentation representations using PolySeg
 * set
 */
export type PolySegConversionOptions = {
  /** Optional array of segment indices to convert */
  segmentIndices?: number[];
  /** ID of the segmentation to convert */
  segmentationId?: string;
  /** Viewport to use for conversion */
  viewport?: Types.IStackViewport | Types.IVolumeViewport;
};

/**
 * Interface for the PolySeg add-on that handles segmentation representation conversions
 */
type ComputeRepresentationFn<T> = (
  segmentationId: string,
  options: PolySegConversionOptions
) => Promise<T>;

type PolySegAddOn = {
  /** Checks if a representation type can be computed for a segmentation */
  canComputeRequestedRepresentation: (
    segmentationId: string,
    representationType: SegmentationRepresentations
  ) => boolean;

  /** Initializes the PolySeg add-on */
  init: () => void;

  /** Computes different segmentation representation data */
  computeContourData: ComputeRepresentationFn<ContourSegmentationData>;
  computeLabelmapData: ComputeRepresentationFn<LabelmapSegmentationData>;
  computeSurfaceData: ComputeRepresentationFn<SurfaceSegmentationData>;

  /** Updates different segmentation representation data */
  updateSurfaceData: ComputeRepresentationFn<SurfaceSegmentationData>;
};

/**
 * Available add-ons that can be configured
 */
type AddOns = {
  polySeg: PolySegAddOn;
};

type ComputeWorkerConfig = {
  autoTerminateOnIdle?: {
    enabled: boolean;
    idleTimeThreshold?: number;
  };
};

/**
 * Configuration type containing add-ons
 */
export type Config = {
  addons: AddOns;
  computeWorker?: ComputeWorkerConfig;
};

let config = {} as Config;

/**
 * Gets the current configuration
 */
export function getConfig(): Config {
  return config;
}

/**
 * Sets a new configuration
 */
export function setConfig(newConfig: Config): void {
  config = newConfig;
}

/**
 * Gets configured add-ons
 */
export function getAddOns(): AddOns {
  return config.addons;
}

let polysegInitialized = false;

/**
 * Gets the PolySeg add-on, initializing it if needed
 * @returns The PolySeg add-on instance or null if not configured
 */
export function getPolySeg() {
  if (!config.addons?.polySeg) {
    console.warn(
      'PolySeg add-on not configured. This will prevent automatic conversion between segmentation representations (labelmap, contour, surface). To enable these features, install @cornerstonejs/polymorphic-segmentation and register it during initialization: cornerstoneTools.init({ addons: { polySeg } }).'
    );

    return null;
  }

  const polyseg = config.addons.polySeg;
  if (!polysegInitialized) {
    polyseg.init();
    polysegInitialized = true;
  }

  return polyseg;
}
