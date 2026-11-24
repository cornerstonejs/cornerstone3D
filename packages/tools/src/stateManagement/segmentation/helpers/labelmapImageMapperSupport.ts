import { Enums, type Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import type { Segmentation } from '../../../types/SegmentationStateTypes';
import { getLabelmaps } from '../labelmapModel/labelmapLayerStore';
import {
  getSourceRenderPlanLayer,
  isGpuDrawnVolumeSlice,
} from '../../../utilities/viewport/getRenderPlanLayer';

const DIRECTION_ALIGNMENT_TOLERANCE = 0.999;
const MINIMUM_SLAB_THICKNESS = 0.1;
const SLAB_THICKNESS_EPSILON = 1e-3;
export const LABELMAP_IMAGE_MAPPER_URL_PARAM = 'labelmapImageMapper';

export type VolumeViewportLabelmapImageMapperState = {
  key: string;
  sliceIndex: number;
  supported: boolean;
};

type ViewportLabelmapImageMapperCompatibilityViewport = Types.IViewport<
  object,
  { blendMode?: Enums.BlendModes; slabThickness?: number }
> & {
  getCurrentImageIdIndex?: () => number;
  getDisplaySetAppearance?: (displaySetId: string) => {
    blendMode?: Enums.BlendModes;
    slabThickness?: number;
  };
  getDefaultActor?: () => Types.ActorEntry | undefined;
  getSourceDisplaySetId?: () => string | undefined;
  getVolumeId?: () => string | undefined;
  getResolvedView?: () =>
    | {
        toICamera?: () => Pick<Types.ICamera, 'viewPlaneNormal' | 'viewUp'>;
      }
    | undefined;
  type?: string;
};

function isPlanarGpuVolumeSliceViewport(
  viewport: Types.IViewport
): viewport is ViewportLabelmapImageMapperCompatibilityViewport {
  const compatibilityViewport =
    viewport as ViewportLabelmapImageMapperCompatibilityViewport;

  if (compatibilityViewport.type !== Enums.ViewportType.PLANAR) {
    return false;
  }

  const layer = getSourceRenderPlanLayer(viewport);

  return layer?.slice === 'gpuVolume' && layer.draw === 'gpu';
}

/**
 * Whether a planar next viewport draws its source as a slice of a volume
 * cut on the CPU and drawn on the GPU (`slice: 'cpu'`, `draw: 'gpu'` in its
 * render plan). Such a viewport makes no 3D texture for its source, so while
 * it shows no slab a labelmap on it is drawn as labelmap slice images with no
 * flag needed. With a slab the labelmap takes the plan it takes on the GPU
 * volume path with that slab.
 */
export function isPlanarCpuSliceViewport(
  viewport: Types.IViewport
): viewport is ViewportLabelmapImageMapperCompatibilityViewport {
  const compatibilityViewport =
    viewport as ViewportLabelmapImageMapperCompatibilityViewport;

  if (compatibilityViewport.type !== Enums.ViewportType.PLANAR) {
    return false;
  }

  const layer = getSourceRenderPlanLayer(viewport);

  return layer?.slice === 'cpu' && layer.draw === 'gpu';
}

/**
 * Whether a planar next viewport draws its source as a slice of a volume, on
 * the GPU volume path or cut on the CPU, so that a labelmap on it can be
 * drawn as labelmap slice images.
 */
function isPlanarVolumeSliceViewport(
  viewport: Types.IViewport
): viewport is ViewportLabelmapImageMapperCompatibilityViewport {
  return (
    isPlanarGpuVolumeSliceViewport(viewport) ||
    isPlanarCpuSliceViewport(viewport)
  );
}

function getPlanarVolumeSliceMapper(
  viewport: ViewportLabelmapImageMapperCompatibilityViewport
) {
  return viewport.getDefaultActor?.()?.actor?.getMapper?.() as
    | {
        getBlendMode?: () => Enums.BlendModes;
        getSlabThickness?: () => number;
      }
    | undefined;
}

function getLabelmapImageMapperCamera(
  viewport: Types.IViewport
): Pick<Types.ICamera, 'viewPlaneNormal' | 'viewUp'> | undefined {
  const compatibilityViewport =
    viewport as ViewportLabelmapImageMapperCompatibilityViewport;
  const resolvedCamera = compatibilityViewport
    .getResolvedView?.()
    ?.toICamera?.();

  return isLabelmapImageMapperCamera(resolvedCamera)
    ? resolvedCamera
    : undefined;
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

function getPlanarVolumeAppearance(
  viewport: ViewportLabelmapImageMapperCompatibilityViewport
) {
  if (!viewport.getDisplaySetAppearance) {
    return;
  }

  const primaryDisplaySetId = getSourceRenderPlanLayer(viewport)?.displaySetId;

  return primaryDisplaySetId
    ? viewport.getDisplaySetAppearance(primaryDisplaySetId)
    : undefined;
}

/**
 * The slab thickness that a viewport shows. A viewport that samples its slice
 * on the CPU keeps the slab only in the appearance of its source, since its
 * image mapper has no slab.
 */
function getCompatibilitySlabThickness(viewport: Types.IViewport): number {
  if (isPlanarCpuSliceViewport(viewport)) {
    return (
      getPlanarVolumeAppearance(viewport)?.slabThickness ??
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
    getPlanarVolumeAppearance(viewport)?.slabThickness ?? MINIMUM_SLAB_THICKNESS
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
 * samples the slice of its source on the CPU (`isPlanarCpuSliceViewport`)
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
    isPlanarCpuSliceViewport(viewport) &&
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
  if (!isPlanarVolumeSliceViewport(viewport)) {
    return false;
  }

  const slabThickness = getCompatibilitySlabThickness(viewport);

  return slabThickness <= MINIMUM_SLAB_THICKNESS + SLAB_THICKNESS_EPSILON;
}

export function getVolumeViewportLabelmapImageMapperState(
  viewport: Types.IViewport
): VolumeViewportLabelmapImageMapperState {
  const compatibilityViewport =
    viewport as ViewportLabelmapImageMapperCompatibilityViewport;
  if (!isPlanarVolumeSliceViewport(viewport)) {
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

  const normalizedNormal = vec3.normalize(
    vec3.create(),
    camera.viewPlaneNormal as unknown as vec3
  ) as Types.Point3;
  const sliceIndex = compatibilityViewport.getCurrentImageIdIndex?.();
  const slabThickness = getCompatibilitySlabThickness(viewport);

  // The planar slice image lies in world coordinates and does not depend on
  // viewUp, so a turn of the view in its own plane needs no new slice.
  const orientationKey = normalizedNormal
    .map((value) => value.toFixed(3))
    .join(',');

  if (slabThickness > MINIMUM_SLAB_THICKNESS + SLAB_THICKNESS_EPSILON) {
    return {
      key: `unsupported:slab:${slabThickness.toFixed(3)}:${orientationKey}`,
      sliceIndex: sliceIndex ?? NaN,
      supported: false,
    };
  }

  if (!isGpuDrawnVolumeSlice(getSourceRenderPlanLayer(viewport))) {
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
