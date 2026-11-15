import { vec3 } from 'gl-matrix';
import cache from '../../../cache/cache';
import { BlendModes, OrientationAxis } from '../../../enums';
import { ActorRenderMode } from '../../../types/IActor';
import type { RenderBackendValue } from '../../../enums';
import { getConfiguration, getEffectiveRenderBackend } from '../../../init';
import * as metaData from '../../../metaData';
import {
  getRenderModeForBackend,
  getRenderSurfaceForRenderMode,
  getSampledVolumeRenderModeForBackend,
} from '../../helpers/renderBackendRegistry';
import resolveViewportVolumeId from '../../helpers/resolveViewportVolumeId';
import { volumeTextureReductionFactors } from '../../helpers/volumeRenderStrategy';
import { gpuSettingsForRender } from '../../../utilities/gpuSettingsPresets';
import type { EffectiveRenderBackend } from '../../../types/RenderBackendRegistry';
import { isValidVolume } from '../../../utilities/isValidVolume';
import { getRenderingCapabilities } from '../../../utilities/renderingCapabilities';
import type { RenderingCapabilities } from '../../../utilities/renderingCapabilities';
import { getSlabSampleOffsets } from '../../../utilities/sampleVolumeSlice';
import { getExactSliceAxis } from '../../../utilities/volumeSliceGeometry';
import { getOrientationFromScanAxisNormal } from '../../helpers/getCameraVectors';
import { resolveSlabThickness } from './planarVolumeSliceBlendMode';
import { isSegmentationOverlayData } from '../renderingFidelity';
import type { BindingRole } from '../ViewportArchitectureTypes';
import type { IImageVolume, Point3 } from '../../../types';
import type {
  PlanarViewState,
  PlanarEffectiveRenderMode,
  PlanarOrientation,
  PlanarRegisteredDataSet,
} from './PlanarViewportTypes';

export interface SelectedPlanarRenderPath {
  acquisitionOrientation?: PlanarViewState['orientation'];
  renderMode: PlanarEffectiveRenderMode;
  volumeId: string;
}

export interface PlanarRenderPathDecisionOptions {
  orientation?: PlanarOrientation;
  useSliceRendering?: boolean;
  /**
   * Per-mount render backend override. 'cpu' and 'gpu' pin this dataset to
   * that backend; 'auto' resolves from the capability detection regardless of
   * the global pin. When omitted, the global
   * rendering.planar.renderBackend configuration decides.
   */
  renderBackend?: RenderBackendValue;
  /**
   * Lets the volume slice path of a source draw the acquired frames in the
   * acquisition plane when the GPU texture of that volume is reduced (see
   * `canDrawAcquiredFrames`). The volume slice shows for a slab thicker than
   * one acquired slice, and for a blend mode other than composite. The
   * viewport sets this for its source data only.
   */
  preferAcquiredFrames?: boolean;
  /** The slab thickness of the data, in mm. */
  slabThickness?: number;
  /** The blend mode of the data. */
  blendMode?: BlendModes;
  /**
   * Slice first for this data set (see `PlanarSetDataOptions.sliceFirst`).
   * When omitted, the global `rendering.planar.sliceFirst` decides.
   */
  sliceFirst?: boolean;
  /** The role of the data set; a segmentation overlay never samples on the CPU. */
  role?: BindingRole;
}

/**
 * The most voxel samples that one sampled slice may take on the CPU: 5 million,
 * about 50 ms at the 8 to 12 ns per sample measured for sampleVolumeGrid. The
 * CPU volume path draws a slab only when it needs no more work than this.
 */
export const MAX_CPU_SLICE_SAMPLES = 5_000_000;

/**
 * Whether the CPU can sample the slab of a view in time, for the CPU volume
 * path. A view with no slab always can. For a slab the estimated work is the number of samples that
 * `sampleVolumeSlice` takes along the normal, which `getSlabSampleOffsets`
 * gives, times the number of pixels of the slice, and it must stay at or
 * under MAX_CPU_SLICE_SAMPLES.
 *
 * The samples along the normal are those of the vtk.js reslice mapper: half
 * the smallest voxel spacing apart, whatever the direction of the normal, so
 * their number depends on the thickness only. The pixels of the slice depend
 * on the view: when the view plane normal follows an axis of the volume
 * (`getExactSliceAxis`), the slice has the size of the volume across that
 * axis. For any other normal, or with no normal, the largest slice of the
 * volume stands for the view, the worst case.
 */
export function canSampleSlabOnCpu(
  volume: Pick<IImageVolume, 'dimensions' | 'spacing'> &
    Partial<Pick<IImageVolume, 'direction'>>,
  slabThickness?: number,
  viewPlaneNormal?: Point3
): boolean {
  const thickness = resolveSlabThickness(slabThickness);

  if (thickness === 0) {
    return true;
  }

  const smallestSpacing = Math.min(...volume.spacing);

  if (!(smallestSpacing > 0)) {
    return false;
  }

  const sampleCount = getSlabSampleOffsets(
    volume as IImageVolume,
    thickness
  ).length;

  return (
    sampleCount * getSliceAreaEstimate(volume, viewPlaneNormal) <=
    MAX_CPU_SLICE_SAMPLES
  );
}

/**
 * The number of pixels of a slice of the volume with the given view plane
 * normal: the size of the volume across the axis that the normal follows, or
 * the area of the largest slice when the normal follows no axis or is
 * missing.
 */
function getSliceAreaEstimate(
  volume: Pick<IImageVolume, 'dimensions'> &
    Partial<Pick<IImageVolume, 'direction'>>,
  viewPlaneNormal?: Point3
): number {
  const [columns, rows, slices] = volume.dimensions;
  const sliceAreas = [rows * slices, columns * slices, columns * rows];
  const sliceAxis =
    viewPlaneNormal && volume.direction
      ? getExactSliceAxis(volume as IImageVolume, viewPlaneNormal)
      : undefined;

  if (sliceAxis !== undefined) {
    return sliceAreas[sliceAxis];
  }

  return Math.max(...sliceAreas);
}

/**
 * Whether a slab thickness gives a slab: more than one sample along the view
 * plane normal (`getSlabSampleOffsets`), whatever the blend mode. The GPU
 * volume path draws its default average slab for a thickness with a blend
 * mode that has no slab type, so the blend mode does not count.
 */
export function hasSlab(
  volume: Pick<IImageVolume, 'spacing'>,
  slabThickness?: number
): boolean {
  return (
    getSlabSampleOffsets(
      volume as IImageVolume,
      resolveSlabThickness(slabThickness)
    ).length > 1
  );
}

/**
 * The facts of one layer (display set) that the device rules of the GPU
 * volume path read.
 */
export type PlanarLayerFacts = {
  /** The array type of the voxels of the layer, such as 'Float32Array'. */
  arrayType?: string;
};

/**
 * Whether the GPU volume path (`vtkVolumeSlice`) can draw a layer correctly
 * on this device. That path holds the voxels of the layer in a 3D texture of
 * their own type. A 32-bit float texture needs linear filtering, and a GPU
 * whose capability profile says `floatLinear` is false (Safari on iOS) reads
 * it as 0, so a float layer cannot go there; nearest filtering would draw
 * it, but not smoothed. Without a profile of a WebGL2 context the GPU path is
 * not limited here. Later device rules (texture size, memory) go here too.
 *
 * @param layer - The facts of the layer
 * @param capabilities - The capability profile of the device
 */
export function canDrawLayerOnGpuVolumePath(
  layer: PlanarLayerFacts,
  capabilities: Pick<RenderingCapabilities, 'webgl' | 'floatLinear'>
): boolean {
  if (!capabilities.webgl) {
    return true;
  }

  return layer.arrayType !== 'Float32Array' || capabilities.floatLinear;
}

/** The facts of {@link PlanarLayerFacts} of a volume. */
function getLayerFacts(volume: IImageVolume): PlanarLayerFacts {
  return {
    arrayType: volume.voxelManager?.getConstructor?.()?.name ?? volume.dataType,
  };
}

type PlanarPathInputs = {
  acquisitionOrientation?: PlanarViewState['orientation'];
  isAcquisitionPath: boolean;
  useVolumePath: boolean;
};

/**
 * Centralizes PlanarViewport render-path decisions.
 *
 * Clean Planar Next callers do not pass a render mode. This service derives the
 * internal path from semantic inputs: dataset shape, requested orientation,
 * and the render backend (per-mount override or global
 * rendering.planar.renderBackend configuration, with 'auto' resolved from
 * init-time capability detection). Binding role is deliberately not part of
 * the decision; source and overlays are mounted through the same rules.
 */
export class PlanarRenderPathDecisionService {
  select(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions = {}
  ): SelectedPlanarRenderPath {
    if (!dataSet.imageIds.length) {
      throw new Error('[PlanarViewport] Cannot add an empty planar dataset');
    }

    const { acquisitionOrientation, isAcquisitionPath, useVolumePath } =
      this.resolvePathInputs(dataSet, options);
    const volumeId = getVolumeId(dataSet);

    if (
      !isAcquisitionPath &&
      !useVolumePath &&
      !dataSet.useWorldCoordinateImageData
    ) {
      throw new Error(
        '[PlanarViewport] Non-acquisition rendering requires a valid volume dataset'
      );
    }

    if (useVolumePath && !supportsVolumeRendering(dataSet)) {
      throw new Error(
        '[PlanarViewport] Volume rendering requires a valid volume dataset'
      );
    }

    return {
      acquisitionOrientation,
      renderMode: useVolumePath
        ? this.selectVolumeRenderModeForDataSet(dataSet, options)
        : this.selectImageRenderMode(options),
      volumeId,
    };
  }

  /**
   * Non-throwing companion to {@link select}: reports whether the dataset can be
   * rendered in the requested orientation/configuration, without selecting a
   * render mode. Lets callers (e.g. OHIF MPR/orientation controls) pre-check an
   * orientation before requesting it, instead of relying on `select()` throwing.
   *
   * Keep the renderability rules here in sync with `select()` above. Slice
   * first only chooses between two volume render modes and falls back to the
   * GPU volume mode, so it never changes whether a data set can render.
   */
  canRender(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions = {}
  ): boolean {
    if (!dataSet.imageIds.length) {
      return false;
    }

    const { isAcquisitionPath, useVolumePath } = this.resolvePathInputs(
      dataSet,
      options
    );

    if (
      !isAcquisitionPath &&
      !useVolumePath &&
      !dataSet.useWorldCoordinateImageData
    ) {
      return false;
    }

    if (useVolumePath && !supportsVolumeRendering(dataSet)) {
      return false;
    }

    return true;
  }

  /**
   * The inputs that `select` and `canRender` share, so the two cannot drift.
   * A data set with a volume always takes the volume path, also when its
   * slice path draws the acquired frames (see `canDrawAcquiredFrames`).
   */
  private resolvePathInputs(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions
  ): PlanarPathInputs {
    const orientation = options.orientation || OrientationAxis.ACQUISITION;
    const acquisitionOrientation = getPlanarAcquisitionOrientation(
      dataSet.imageIds
    );
    const isAcquisitionPath =
      orientation === OrientationAxis.ACQUISITION ||
      (acquisitionOrientation !== undefined &&
        orientation === acquisitionOrientation);
    const useVolumePath = isVolumeBackedDataSet(dataSet, isAcquisitionPath);

    return {
      acquisitionOrientation,
      isAcquisitionPath,
      useVolumePath,
    };
  }

  /**
   * Whether the volume slice path of a data set may draw the acquired frames
   * in place of the reduced slice. The orientation is not an input: the render
   * path draws a frame only while the view is in the acquisition plane.
   *
   * All of these must hold: the caller prefers the acquired frames; the data
   * set names a cached, non-dynamic volume; the volume path of the resolved
   * backend draws from a GPU texture; final downsampling with the active GPU
   * settings reduces that texture on at least one axis; the slab is not thicker than
   * one acquired slice; and the blend mode is composite.
   *
   * A CPU volume path reads the full-resolution voxels, so it never needs the
   * frames for this reason.
   */
  canDrawAcquiredFrames(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions
  ): boolean {
    if (
      !options.preferAcquiredFrames ||
      !dataSet.volumeId ||
      dataSet.useWorldCoordinateImageData
    ) {
      return false;
    }

    if (
      options.blendMode !== undefined &&
      options.blendMode !== BlendModes.COMPOSITE
    ) {
      return false;
    }

    const volume = cache.getVolume(dataSet.volumeId);

    if (!volume?.voxelGrid || volume.isDynamicVolume?.()) {
      return false;
    }

    if (resolveSlabThickness(options.slabThickness) > volume.spacing[2]) {
      return false;
    }

    if (
      getRenderSurfaceForRenderMode(this.selectVolumeRenderMode(options)) ===
      'cpu'
    ) {
      return false;
    }

    return volumeTextureReductionFactors(volume, gpuSettingsForRender()).some(
      (factor) => factor > 1
    );
  }

  private selectImageRenderMode(
    options: PlanarRenderPathDecisionOptions
  ): PlanarEffectiveRenderMode {
    return getRenderModeForBackend(this.resolveBackend(options), 'image');
  }

  private selectVolumeRenderMode(
    options: PlanarRenderPathDecisionOptions
  ): PlanarEffectiveRenderMode {
    return getRenderModeForBackend(this.resolveBackend(options), 'volume');
  }

  /**
   * The volume render mode of one data set: the sampled volume mode of the
   * resolved backend when `canSampleSliceOnCpu` holds, the volume mode of the
   * backend otherwise. So with slice first on and the 'gpu' backend, a plain
   * slice is sampled and any slab is drawn by the GPU volume path, except the
   * slab of a layer that this device cannot draw there
   * (`canDrawLayerOnGpuVolumePath`), which is sampled too. A backend with no
   * sampled volume mode (the 'cpu'
   * backend, or an extension backend that declares none) keeps its volume
   * mode. The viewport calls it again once the data provider has loaded a
   * data set on the volume path, because the load may create the volume that
   * the first decision did not find in the cache.
   */
  selectVolumeRenderModeForDataSet(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions
  ): PlanarEffectiveRenderMode {
    const backend = this.resolveBackend(options);
    const sampledVolumeRenderMode =
      getSampledVolumeRenderModeForBackend(backend);

    if (sampledVolumeRenderMode && this.canSampleSliceOnCpu(dataSet, options)) {
      return sampledVolumeRenderMode;
    }

    return getRenderModeForBackend(backend, 'volume');
  }

  /**
   * Whether a volume data set may draw its slice sampled on the CPU (slice
   * first). All of these must hold: slice first is on for the data set (its
   * own option, else the global configuration); the volume is in the cache,
   * under the id that the data provider gives it (`resolveViewportVolumeId`),
   * and holds one value per voxel (a colour volume keeps the GPU volume
   * path); the data set is not a segmentation overlay; and the view has no
   * slab (`hasSlab`), or the GPU volume path cannot draw this layer on this
   * device (`canDrawLayerOnGpuVolumePath` with the capability profile), so
   * its slab is sampled on the CPU whatever its thickness. The caller checks
   * that the data set takes the volume path and that the backend has a
   * sampled volume mode.
   */
  private canSampleSliceOnCpu(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions
  ): boolean {
    const sliceFirst =
      options.sliceFirst ??
      getConfiguration().rendering?.planar?.sliceFirst ??
      false;

    if (!sliceFirst) {
      return false;
    }

    if (
      isSegmentationOverlayData(dataSet, {
        renderMode: ActorRenderMode.VTK_SAMPLED_SLICE,
        role: options.role ?? 'overlay',
      })
    ) {
      return false;
    }

    const volume = cache.getVolume(
      resolveViewportVolumeId(getVolumeId(dataSet))
    );

    if (
      !volume?.imageData ||
      !volume.voxelManager ||
      (volume.voxelManager.numberOfComponents ?? 1) !== 1
    ) {
      return false;
    }

    return (
      !hasSlab(volume, options.slabThickness) ||
      !canDrawLayerOnGpuVolumePath(
        getLayerFacts(volume),
        getRenderingCapabilities()
      )
    );
  }

  /**
   * Resolves the effective backend for one decision: the per-mount override
   * when present ('auto' resolves from capability detection even when the
   * global backend is pinned), the global configuration otherwise. The
   * precedence ladder itself lives in getEffectiveRenderBackend so it cannot
   * drift from the global resolution. The backend's render modes come from
   * its registerRenderBackend() definition.
   */
  private resolveBackend(
    options: PlanarRenderPathDecisionOptions
  ): EffectiveRenderBackend {
    return getEffectiveRenderBackend(options.renderBackend);
  }
}

export const defaultPlanarRenderPathDecisionService =
  new PlanarRenderPathDecisionService();

export function selectPlanarRenderPath(
  dataSet: PlanarRegisteredDataSet,
  options: PlanarRenderPathDecisionOptions = {}
): SelectedPlanarRenderPath {
  return defaultPlanarRenderPathDecisionService.select(dataSet, options);
}

export function getPlanarAcquisitionOrientation(
  imageIds: string[]
): PlanarViewState['orientation'] | undefined {
  const imageId = imageIds[0];

  if (!imageId) {
    return;
  }

  const imagePlaneModule = metaData.get('imagePlaneModule', imageId);
  const imageOrientationPatient = imagePlaneModule?.imageOrientationPatient;

  if (!imageOrientationPatient || imageOrientationPatient.length !== 6) {
    return;
  }

  const rowVec = vec3.fromValues(
    imageOrientationPatient[0],
    imageOrientationPatient[1],
    imageOrientationPatient[2]
  );
  const colVec = vec3.fromValues(
    imageOrientationPatient[3],
    imageOrientationPatient[4],
    imageOrientationPatient[5]
  );
  const scanAxisNormal = vec3.create();

  vec3.cross(scanAxisNormal, rowVec, colVec);

  const orientation = getOrientationFromScanAxisNormal([
    scanAxisNormal[0],
    scanAxisNormal[1],
    scanAxisNormal[2],
  ]);

  if (
    orientation !== OrientationAxis.AXIAL &&
    orientation !== OrientationAxis.CORONAL &&
    orientation !== OrientationAxis.SAGITTAL
  ) {
    return;
  }

  return orientation;
}

function getVolumeId(dataSet: PlanarRegisteredDataSet): string {
  return dataSet.volumeId || cache.generateVolumeId(dataSet.imageIds);
}

function hasExplicitCachedVolume(dataSet: PlanarRegisteredDataSet): boolean {
  return !!(dataSet.volumeId && cache.getVolume(dataSet.volumeId));
}

function supportsVolumeRendering(dataSet: PlanarRegisteredDataSet): boolean {
  return hasExplicitCachedVolume(dataSet) || isValidVolume(dataSet.imageIds);
}

function isVolumeBackedDataSet(
  dataSet: PlanarRegisteredDataSet,
  isAcquisitionPath: boolean
): boolean {
  if (dataSet.useWorldCoordinateImageData) {
    return false;
  }

  if (dataSet.volumeId) {
    return true;
  }

  return !isAcquisitionPath && supportsVolumeRendering(dataSet);
}
