import { vec3 } from 'gl-matrix';
import {
  cache,
  Enums,
  utilities as csUtils,
  CONSTANTS,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { getViewportPlane } from './spatial';

const { RENDERING_DEFAULTS } = CONSTANTS;

/**
 * Fraction of the slice spacing along the view normal used as the sampling
 * step, mirroring the legacy line-of-sight search granularity.
 */
const STEP_SPACING_FRACTION = 0.25;

/** Hard cap on samples per pick so a huge slab cannot stall an interaction. */
const MAX_SAMPLES = 2001;

export type SlabIntensityPickMode = 'max' | 'min';

type PresentationWithSlab = {
  blendMode?: Enums.BlendModes;
  slabThickness?: number;
};

/**
 * Resolves how (and whether) intensity picking applies to a viewport: the
 * viewport must be a Generic planar viewport in volume mode whose source
 * display-set presentation renders an intensity-projection slab (MIP or
 * MinIP with a real slab thickness).
 *
 * Returns the pick mode ('max' for MIP, 'min' for MinIP) and the slab
 * thickness, or null when intensity picking does not apply.
 */
export function getSlabIntensityPickContext(
  viewport: Types.IViewport
): { mode: SlabIntensityPickMode; slabThicknessMm: number } | null {
  if (!csUtils.isGenericViewport(viewport)) {
    return null;
  }

  try {
    if (viewport.getCurrentMode?.() !== 'volume') {
      return null;
    }
  } catch {
    return null;
  }

  if (!csUtils.viewportSupportsDisplaySetPresentation(viewport)) {
    return null;
  }

  const dataId = viewport.getSourceDataId();
  if (!dataId) {
    return null;
  }

  const presentation = (
    viewport as unknown as Types.IGenericViewport
  ).getDisplaySetPresentation(dataId) as PresentationWithSlab | undefined;

  const { blendMode, slabThickness } = presentation ?? {};

  let mode: SlabIntensityPickMode;
  if (blendMode === Enums.BlendModes.MAXIMUM_INTENSITY_BLEND) {
    mode = 'max';
  } else if (blendMode === Enums.BlendModes.MINIMUM_INTENSITY_BLEND) {
    mode = 'min';
  } else {
    return null;
  }

  if (
    !Number.isFinite(slabThickness) ||
    slabThickness <= RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS
  ) {
    return null;
  }

  return { mode, slabThicknessMm: slabThickness };
}

/**
 * Picks the extremal-intensity world point along a viewport's view-plane
 * normal within its rendered intensity-projection slab.
 *
 * An intensity-projection (MIP/MinIP) viewport shows, at each pixel, the
 * extremal voxel anywhere inside the slab - so a world point derived from a
 * click lies on the arbitrary central slab plane, not on the anatomy the
 * user sees. This helper resamples the source volume along the normal
 * through `worldPoint` (clamped to the slab) and returns the location of
 * the maximum (MIP) or minimum (MinIP) intensity, i.e. the point the
 * projection actually displayed.
 *
 * Works exclusively through the Generic ("next") viewport surface: the slab
 * and blend mode are read from the source display-set presentation and the
 * volume is sampled directly from the cache (no legacy viewport APIs).
 *
 * On equal intensities the sample closest to the central plane wins, so
 * uniform regions keep the point where the user clicked.
 *
 * Returns null when the viewport does not render an intensity-projection
 * slab, or when no volume/plane/finite sample is available.
 */
export default function pickIntensityPointInSlab(
  viewport: Types.IViewport,
  worldPoint: Types.Point3
): Types.Point3 | null {
  const context = getSlabIntensityPickContext(viewport);
  if (!context || !worldPoint) {
    return null;
  }

  const volumeId = (
    viewport as { getVolumeId?: () => string | undefined }
  ).getVolumeId?.();
  const volume = volumeId ? cache.getVolume(volumeId) : undefined;
  if (
    !volume?.voxelManager ||
    !volume.dimensions ||
    !volume.spacing ||
    !volume.direction ||
    !volume.origin
  ) {
    return null;
  }

  const plane = getViewportPlane(viewport);
  if (!plane) {
    return null;
  }

  const normal = plane.normal;
  const spacingAlongNormal =
    Math.abs(normal[0]) * volume.spacing[0] +
    Math.abs(normal[1]) * volume.spacing[1] +
    Math.abs(normal[2]) * volume.spacing[2];

  if (!Number.isFinite(spacingAlongNormal) || spacingAlongNormal <= 0) {
    return null;
  }

  const halfRange = context.slabThicknessMm / 2;
  let step = spacingAlongNormal * STEP_SPACING_FRACTION;
  const stepsPerSide = Math.min(
    Math.ceil(halfRange / step),
    (MAX_SAMPLES - 1) / 2
  );
  step = halfRange / stepsPerSide;

  const wantMax = context.mode === 'max';
  let bestValue = NaN;
  let bestOffset = 0;

  const samplePoint = vec3.create();
  const sampleAt = (offset: number): void => {
    vec3.scaleAndAdd(samplePoint, worldPoint, normal, offset);
    const value = csUtils.VoxelManager.sampleAtWorld(volume, [
      samplePoint[0],
      samplePoint[1],
      samplePoint[2],
    ]);
    if (!Number.isFinite(value)) {
      return;
    }
    // Strictly-better comparison: outward iteration then prefers the sample
    // closest to the central plane on ties.
    if (
      Number.isNaN(bestValue) ||
      (wantMax ? value > bestValue : value < bestValue)
    ) {
      bestValue = value;
      bestOffset = offset;
    }
  };

  sampleAt(0);
  for (let i = 1; i <= stepsPerSide; i++) {
    sampleAt(i * step);
    sampleAt(-i * step);
  }

  if (Number.isNaN(bestValue)) {
    return null;
  }

  return [
    worldPoint[0] + normal[0] * bestOffset,
    worldPoint[1] + normal[1] * bestOffset,
    worldPoint[2] + normal[2] * bestOffset,
  ];
}
