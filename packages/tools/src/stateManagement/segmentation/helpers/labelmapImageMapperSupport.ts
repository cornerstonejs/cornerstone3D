import { Enums, VolumeViewport, type Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import { getLabelmaps } from './labelmapSegmentationState';

const DIRECTION_ALIGNMENT_TOLERANCE = 0.999;
const MINIMUM_SLAB_THICKNESS = 0.1;
const SLAB_THICKNESS_EPSILON = 1e-3;
export const LABELMAP_IMAGE_MAPPER_URL_PARAM = 'labelmapImageMapper';

export type VolumeViewportLabelmapImageMapperState = {
  key: string;
  sliceIndex: number;
  supported: boolean;
};

export function isSliceRenderingEnabled(options?: {
  useSliceRendering?: boolean;
}): boolean {
  if (options?.useSliceRendering) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);

  if (!params.has(LABELMAP_IMAGE_MAPPER_URL_PARAM)) {
    return false;
  }

  const value = params.get(LABELMAP_IMAGE_MAPPER_URL_PARAM);

  if (value === null || value === '') {
    return true;
  }

  const normalizedValue = value.trim().toLowerCase();

  return (
    normalizedValue !== '0' &&
    normalizedValue !== 'false' &&
    normalizedValue !== 'off'
  );
}

export function shouldUseSliceRendering(
  segmentation?: Segmentation,
  options?: {
    useSliceRendering?: boolean;
  }
): boolean {
  if (isSliceRenderingEnabled(options)) {
    return true;
  }

  if (!segmentation?.representationData?.Labelmap) {
    return false;
  }

  const layers = getLabelmaps(segmentation);

  return layers.length > 1 && layers.some((layer) => layer.type === 'stack');
}

export function canRenderVolumeViewportLabelmapAsImage(
  viewport: Types.IViewport
): viewport is Types.IVolumeViewport {
  if (!(viewport instanceof VolumeViewport)) {
    return false;
  }

  if (viewport.getBlendMode?.() !== Enums.BlendModes.COMPOSITE) {
    return false;
  }

  if (
    viewport.getSlabThickness?.() >
    MINIMUM_SLAB_THICKNESS + SLAB_THICKNESS_EPSILON
  ) {
    return false;
  }

  try {
    viewport.getSliceViewInfo();
    return true;
  } catch {
    return false;
  }
}

export function getVolumeViewportLabelmapImageMapperState(
  viewport: Types.IViewport
): VolumeViewportLabelmapImageMapperState {
  if (!(viewport instanceof VolumeViewport)) {
    return {
      key: 'unsupported:viewport',
      sliceIndex: NaN,
      supported: false,
    };
  }

  const { viewPlaneNormal, viewUp } = viewport.getCamera();
  const normalizedNormal = vec3.normalize(
    vec3.create(),
    viewPlaneNormal as unknown as vec3
  ) as Types.Point3;
  const normalizedViewUp = vec3.normalize(
    vec3.create(),
    viewUp as unknown as vec3
  ) as Types.Point3;
  let sliceIndex: number | undefined;

  try {
    sliceIndex = viewport.getSliceViewInfo().sliceIndex;
  } catch {
    sliceIndex = undefined;
  }
  const blendMode = viewport.getBlendMode?.();
  const slabThickness = viewport.getSlabThickness?.() ?? MINIMUM_SLAB_THICKNESS;

  const orientationKey = [
    normalizedNormal.map((value) => value.toFixed(3)).join(','),
    normalizedViewUp.map((value) => value.toFixed(3)).join(','),
  ].join('|');

  if (blendMode !== Enums.BlendModes.COMPOSITE) {
    return {
      key: `unsupported:blend:${blendMode}:${orientationKey}`,
      sliceIndex: sliceIndex ?? NaN,
      supported: false,
    };
  }

  if (slabThickness > MINIMUM_SLAB_THICKNESS + SLAB_THICKNESS_EPSILON) {
    return {
      key: `unsupported:slab:${slabThickness.toFixed(3)}:${orientationKey}`,
      sliceIndex: sliceIndex ?? NaN,
      supported: false,
    };
  }

  try {
    viewport.getSliceViewInfo();
  } catch {
    return {
      key: `unsupported:oblique:${orientationKey}`,
      sliceIndex: sliceIndex ?? NaN,
      supported: false,
    };
  }

  return {
    // Use the discrete slice index instead of focal-point-derived world position.
    // Zoom and pan can move camera/focal point without changing the extracted
    // labelmap slice, and using world position here causes redundant renders.
    key: `supported:${orientationKey}:${sliceIndex ?? 0}`,
    sliceIndex: sliceIndex ?? NaN,
    supported: true,
  };
}

export { DIRECTION_ALIGNMENT_TOLERANCE };
