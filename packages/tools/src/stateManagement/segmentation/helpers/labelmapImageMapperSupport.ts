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

type ViewportLabelmapImageMapperCompatibilityViewport = Types.IViewport & {
  getBlendMode?: () => Enums.BlendModes | undefined;
  getCurrentImageIdIndex?: () => number;
  getDefaultActor?: () =>
    | (Types.ActorEntry & {
        actorMapper?: {
          renderMode?: string;
        };
      })
    | undefined;
  getProperties?: (volumeId?: string) => {
    slabThickness?: number;
  };
  getSliceViewInfo?: () => {
    sliceIndex: number;
  };
  getVolumeId?: () => string | undefined;
  type?: string;
};

function isPlanarGpuVolumeSliceViewport(
  viewport: Types.IViewport
): viewport is ViewportLabelmapImageMapperCompatibilityViewport {
  const compatibilityViewport =
    viewport as ViewportLabelmapImageMapperCompatibilityViewport;

  if (compatibilityViewport.type !== Enums.ViewportType.PLANAR_V2) {
    return false;
  }

  if (!compatibilityViewport.getVolumeId?.()) {
    return false;
  }

  const defaultActor = compatibilityViewport.getDefaultActor?.();
  const renderMode = defaultActor?.actorMapper?.renderMode;

  return renderMode === 'vtkVolumeSlice';
}

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
): viewport is ViewportLabelmapImageMapperCompatibilityViewport {
  const compatibilityViewport =
    viewport as ViewportLabelmapImageMapperCompatibilityViewport;
  const isLegacyVolumeViewport = viewport instanceof VolumeViewport;
  const isNextPlanarViewport = isPlanarGpuVolumeSliceViewport(viewport);

  if (!isLegacyVolumeViewport && !isNextPlanarViewport) {
    return false;
  }

  if (compatibilityViewport.getBlendMode?.() !== Enums.BlendModes.COMPOSITE) {
    return false;
  }

  const slabThickness = isLegacyVolumeViewport
    ? viewport.getSlabThickness?.()
    : (compatibilityViewport.getProperties?.(
        compatibilityViewport.getVolumeId?.()
      )?.slabThickness ?? MINIMUM_SLAB_THICKNESS);

  if (slabThickness > MINIMUM_SLAB_THICKNESS + SLAB_THICKNESS_EPSILON) {
    return false;
  }

  if (isLegacyVolumeViewport) {
    try {
      viewport.getSliceViewInfo();
      return true;
    } catch {
      return false;
    }
  }

  return true;
}

export function getVolumeViewportLabelmapImageMapperState(
  viewport: Types.IViewport
): VolumeViewportLabelmapImageMapperState {
  const compatibilityViewport =
    viewport as ViewportLabelmapImageMapperCompatibilityViewport;
  const isLegacyVolumeViewport = viewport instanceof VolumeViewport;
  const isNextPlanarViewport = isPlanarGpuVolumeSliceViewport(viewport);

  if (!isLegacyVolumeViewport && !isNextPlanarViewport) {
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

  if (isLegacyVolumeViewport) {
    try {
      sliceIndex = viewport.getSliceViewInfo().sliceIndex;
    } catch {
      sliceIndex = undefined;
    }
  } else {
    sliceIndex = compatibilityViewport.getCurrentImageIdIndex?.();
  }
  const blendMode = compatibilityViewport.getBlendMode?.();
  const slabThickness = isLegacyVolumeViewport
    ? viewport.getSlabThickness?.()
    : (compatibilityViewport.getProperties?.(
        compatibilityViewport.getVolumeId?.()
      )?.slabThickness ?? MINIMUM_SLAB_THICKNESS);

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

  if (isLegacyVolumeViewport) {
    try {
      viewport.getSliceViewInfo();
    } catch {
      return {
        key: `unsupported:oblique:${orientationKey}`,
        sliceIndex: sliceIndex ?? NaN,
        supported: false,
      };
    }
  }

  if (
    isNextPlanarViewport &&
    compatibilityViewport.getDefaultActor?.()?.actorMapper?.renderMode !==
      'vtkVolumeSlice'
  ) {
    return {
      key: `unsupported:renderMode:${orientationKey}`,
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
