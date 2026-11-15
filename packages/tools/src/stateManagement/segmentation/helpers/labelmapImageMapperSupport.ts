import {
  ActorRenderMode,
  Enums,
  VolumeViewport,
  type Types,
} from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import { getLabelmaps } from '../labelmapModel/labelmapLayerStore';

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
  getCamera?: () => Pick<Types.ICamera, 'viewPlaneNormal' | 'viewUp'>;
  getCurrentImageIdIndex?: () => number;
  getDisplaySetRenderMode?: (
    displaySetId: string
  ) => Types.ActorRenderMode | string | undefined;
  getDisplaySetRole?: (
    displaySetId: string
  ) => 'source' | 'overlay' | undefined;
  getDisplaySetPresentation?: (dataId: string) => {
    blendMode?: Enums.BlendModes;
    slabThickness?: number;
  };
  getDefaultActor?: () =>
    | (Types.ActorEntry & {
        actorMapper?: {
          actor?: {
            getMapper?: () => {
              getBlendMode?: () => Enums.BlendModes;
              getSlabThickness?: () => number;
            };
          };
          mapper?: {
            getBlendMode?: () => Enums.BlendModes;
            getSlabThickness?: () => number;
          };
          renderMode?: Types.ActorRenderMode;
        };
      })
    | undefined;
  getSliceViewInfo?: () => {
    sliceIndex: number;
  };
  getSourceDataId?: () => string | undefined;
  getVolumeId?: () => string | undefined;
  getResolvedView?: () =>
    | {
        toICamera?: () => Pick<Types.ICamera, 'viewPlaneNormal' | 'viewUp'>;
      }
    | undefined;
  type?: string;
};

function isSupportedImageMapperBlendMode(
  blendMode: Enums.BlendModes | undefined
): boolean {
  return (
    blendMode === Enums.BlendModes.COMPOSITE ||
    blendMode === Enums.BlendModes.AVERAGE_INTENSITY_BLEND
  );
}

function isPlanarGpuVolumeSliceViewport(
  viewport: Types.IViewport
): viewport is ViewportLabelmapImageMapperCompatibilityViewport {
  const compatibilityViewport =
    viewport as ViewportLabelmapImageMapperCompatibilityViewport;

  if (compatibilityViewport.type !== Enums.ViewportType.PLANAR_NEXT) {
    return false;
  }

  return (
    getPlanarPrimaryRenderMode(compatibilityViewport) ===
    ActorRenderMode.VTK_VOLUME_SLICE
  );
}

/**
 * Whether a planar next viewport draws its source as a slice of a volume
 * sampled on the CPU (`vtkSampledSlice`). Such a viewport makes no 3D texture
 * for its source, so while it shows no slab a labelmap on it is drawn as
 * labelmap slice images with no flag needed. With a slab the labelmap takes
 * the plan it takes on the GPU volume path with that slab.
 */
export function isPlanarSampledSliceViewport(
  viewport: Types.IViewport
): viewport is ViewportLabelmapImageMapperCompatibilityViewport {
  const compatibilityViewport =
    viewport as ViewportLabelmapImageMapperCompatibilityViewport;

  if (compatibilityViewport.type !== Enums.ViewportType.PLANAR_NEXT) {
    return false;
  }

  return (
    getPlanarPrimaryRenderMode(compatibilityViewport) ===
    ActorRenderMode.VTK_SAMPLED_SLICE
  );
}

/**
 * Whether a planar next viewport draws its source as a slice of a volume, on
 * the GPU volume path or sampled on the CPU, so that a labelmap on it can be
 * drawn as labelmap slice images.
 */
function isPlanarVolumeSliceViewport(
  viewport: Types.IViewport
): viewport is ViewportLabelmapImageMapperCompatibilityViewport {
  return (
    isPlanarGpuVolumeSliceViewport(viewport) ||
    isPlanarSampledSliceViewport(viewport)
  );
}

function getPlanarPrimaryRenderMode(
  viewport: ViewportLabelmapImageMapperCompatibilityViewport
): Types.ActorRenderMode | string | undefined {
  const primaryDataId = getPlanarPrimaryDataId(viewport);

  if (primaryDataId) {
    const renderMode = viewport.getDisplaySetRenderMode?.(primaryDataId);

    if (renderMode) {
      return renderMode;
    }
  }

  return viewport.getDefaultActor?.()?.actorMapper?.renderMode;
}

function getPlanarVolumeSliceMapper(
  viewport: ViewportLabelmapImageMapperCompatibilityViewport
) {
  const defaultActor = viewport.getDefaultActor?.();

  return (defaultActor?.actorMapper?.mapper ??
    defaultActor?.actorMapper?.actor?.getMapper?.()) as
    | {
        getBlendMode?: () => Enums.BlendModes;
        getSlabThickness?: () => number;
      }
    | undefined;
}

function getPlanarPrimaryDataId(
  viewport: ViewportLabelmapImageMapperCompatibilityViewport
): string | undefined {
  const sourceDataId = viewport.getSourceDataId?.();

  if (sourceDataId) {
    return sourceDataId;
  }

  const renderModes = (
    viewport as Types.IViewport & {
      _debug?: {
        renderModes?: Record<string, Types.ActorRenderMode>;
      };
    }
  )._debug?.renderModes;

  if (!renderModes) {
    return;
  }

  return (
    Object.entries(renderModes).find(
      ([dataId, renderMode]) =>
        viewport.getDisplaySetRole?.(dataId) === 'source' &&
        isVolumeSliceRenderMode(renderMode)
    )?.[0] ??
    Object.entries(renderModes).find(([, renderMode]) =>
      isVolumeSliceRenderMode(renderMode)
    )?.[0]
  );
}

/**
 * Whether a render mode draws a slice of a volume as a `vtkImageSlice`: the GPU
 * volume slice path or the slice sampled on the CPU.
 */
function isVolumeSliceRenderMode(
  renderMode: Types.ActorRenderMode | string | undefined
): boolean {
  return (
    renderMode === ActorRenderMode.VTK_VOLUME_SLICE ||
    renderMode === ActorRenderMode.VTK_SAMPLED_SLICE
  );
}

function getLabelmapImageMapperCamera(
  viewport: Types.IViewport
): Pick<Types.ICamera, 'viewPlaneNormal' | 'viewUp'> | undefined {
  const compatibilityViewport =
    viewport as ViewportLabelmapImageMapperCompatibilityViewport;
  const resolvedCamera = compatibilityViewport
    .getResolvedView?.()
    ?.toICamera?.();

  if (isLabelmapImageMapperCamera(resolvedCamera)) {
    return resolvedCamera;
  }

  const legacyCamera = compatibilityViewport.getCamera?.();

  return isLabelmapImageMapperCamera(legacyCamera) ? legacyCamera : undefined;
}

function isLabelmapImageMapperCamera(
  camera: unknown
): camera is Pick<Types.ICamera, 'viewPlaneNormal' | 'viewUp'> {
  const candidate = camera as Partial<Types.ICamera> | undefined;

  return Boolean(
    candidate &&
      isPoint3Like(candidate.viewPlaneNormal) &&
      isPoint3Like(candidate.viewUp)
  );
}

function isPoint3Like(value: unknown): value is ArrayLike<number> {
  const candidate = value as ArrayLike<number> | undefined;

  return Boolean(
    candidate &&
      typeof candidate.length === 'number' &&
      candidate.length >= 3 &&
      Number.isFinite(Number(candidate[0])) &&
      Number.isFinite(Number(candidate[1])) &&
      Number.isFinite(Number(candidate[2]))
  );
}

function getPlanarVolumeDataPresentation(
  viewport: ViewportLabelmapImageMapperCompatibilityViewport
) {
  if (!viewport.getDisplaySetPresentation) {
    return;
  }

  const primaryDataId = getPlanarPrimaryDataId(viewport);

  return primaryDataId
    ? viewport.getDisplaySetPresentation(primaryDataId)
    : undefined;
}

function getCompatibilityBlendMode(
  viewport: Types.IViewport
): Enums.BlendModes | undefined {
  if (viewport instanceof VolumeViewport) {
    return viewport.getBlendMode?.();
  }

  if (!isPlanarGpuVolumeSliceViewport(viewport)) {
    return;
  }

  const presentationBlendMode =
    getPlanarVolumeDataPresentation(viewport)?.blendMode;

  if (presentationBlendMode !== undefined) {
    return presentationBlendMode;
  }

  return Enums.BlendModes.AVERAGE_INTENSITY_BLEND;
}

/**
 * The slab thickness that a viewport shows. A viewport that samples its slice
 * on the CPU keeps the slab only in the presentation of its source, since its
 * image mapper has no slab.
 */
function getCompatibilitySlabThickness(viewport: Types.IViewport): number {
  if (viewport instanceof VolumeViewport) {
    return viewport.getSlabThickness?.() ?? MINIMUM_SLAB_THICKNESS;
  }

  if (isPlanarSampledSliceViewport(viewport)) {
    return (
      getPlanarVolumeDataPresentation(viewport)?.slabThickness ??
      MINIMUM_SLAB_THICKNESS
    );
  }

  if (!isPlanarGpuVolumeSliceViewport(viewport)) {
    return MINIMUM_SLAB_THICKNESS;
  }

  const mapperSlabThickness =
    getPlanarVolumeSliceMapper(viewport)?.getSlabThickness?.();

  if (typeof mapperSlabThickness === 'number') {
    return mapperSlabThickness;
  }

  return (
    getPlanarVolumeDataPresentation(viewport)?.slabThickness ??
    MINIMUM_SLAB_THICKNESS
  );
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

/**
 * Whether a labelmap is drawn as labelmap slice images: when the
 * `useSliceRendering` option or the URL flag asks for it, when the
 * segmentation mixes stack and volume labelmap layers, and on a viewport that
 * samples the slice of its source on the CPU (`isPlanarSampledSliceViewport`)
 * while it shows no slab.
 */
export function shouldUseSliceRendering(
  segmentation?: Segmentation,
  options?: {
    useSliceRendering?: boolean;
  },
  viewport?: Types.IViewport
): boolean {
  if (isSliceRenderingEnabled(options)) {
    return true;
  }

  if (
    viewport &&
    isPlanarSampledSliceViewport(viewport) &&
    canRenderVolumeViewportLabelmapAsImage(viewport)
  ) {
    return true;
  }

  if (!segmentation?.representationData?.Labelmap) {
    return false;
  }

  const layers = getLabelmaps(segmentation);

  return (
    layers.length > 1 && layers.some((layer) => layer.storageKind === 'stack')
  );
}

export function canRenderVolumeViewportLabelmapAsImage(
  viewport: Types.IViewport
): viewport is ViewportLabelmapImageMapperCompatibilityViewport {
  const isLegacyVolumeViewport = viewport instanceof VolumeViewport;
  const isNextPlanarViewport = isPlanarVolumeSliceViewport(viewport);

  if (!isLegacyVolumeViewport && !isNextPlanarViewport) {
    return false;
  }

  const blendMode = getCompatibilityBlendMode(viewport);

  if (isLegacyVolumeViewport && !isSupportedImageMapperBlendMode(blendMode)) {
    return false;
  }

  const slabThickness = getCompatibilitySlabThickness(viewport);

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
  const isNextPlanarViewport = isPlanarVolumeSliceViewport(viewport);

  if (!isLegacyVolumeViewport && !isNextPlanarViewport) {
    return {
      key: 'unsupported:viewport',
      sliceIndex: NaN,
      supported: false,
    };
  }

  const camera = getLabelmapImageMapperCamera(viewport);

  if (!camera) {
    return {
      key: 'unsupported:camera',
      sliceIndex: NaN,
      supported: false,
    };
  }

  const { viewPlaneNormal, viewUp } = camera;
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
  const blendMode = getCompatibilityBlendMode(viewport);
  const slabThickness = getCompatibilitySlabThickness(viewport);

  // The planar slice image lies in world coordinates and does not depend on
  // viewUp, so a turn of the view in its own plane needs no new slice.
  const orientationKey = [
    normalizedNormal.map((value) => value.toFixed(3)).join(','),
    ...(isLegacyVolumeViewport
      ? [normalizedViewUp.map((value) => value.toFixed(3)).join(',')]
      : []),
  ].join('|');

  if (isLegacyVolumeViewport && !isSupportedImageMapperBlendMode(blendMode)) {
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
    !isVolumeSliceRenderMode(getPlanarPrimaryRenderMode(compatibilityViewport))
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
