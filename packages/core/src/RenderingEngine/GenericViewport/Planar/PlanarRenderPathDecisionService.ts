import { vec3 } from 'gl-matrix';
import cache from '../../../cache/cache';
import { BlendModes, OrientationAxis } from '../../../enums';
import type { RenderBackendValue } from '../../../enums';
import { getEffectiveRenderBackend } from '../../../init';
import * as metaData from '../../../metaData';
import {
  getRenderModeForBackend,
  getRenderSurfaceForRenderMode,
} from '../../helpers/renderBackendRegistry';
import { volumeTextureReductionFactors } from '../../helpers/volumeRenderStrategy';
import { gpuSettingsForRender } from '../../../utilities/gpuSettingsPresets';
import type { EffectiveRenderBackend } from '../../../types/RenderBackendRegistry';
import { isValidVolume } from '../../../utilities/isValidVolume';
import { getOrientationFromScanAxisNormal } from '../../helpers/getCameraVectors';
import { MPR_CAMERA_VALUES } from '../../../constants';
import { isAcquisitionPlaneNormal } from '../../../utilities/isAcquisitionPlaneNormal';
import getAcquisitionPlaneOrientation from '../../../utilities/getAcquisitionPlaneOrientation';
import type { IImageVolume, Mat3, Point3 } from '../../../types';
import { resolveSlabThickness } from './planarVolumeSliceBlendMode';
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
        ? this.selectVolumeRenderMode(options)
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
   * Keep the renderability rules here in sync with `select()` above.
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

/**
 * The standard orientation that the acquired frames show, or undefined.
 *
 * The frames show a standard orientation only when the acquisition view is
 * that orientation on the screen:
 * - `isAcquisitionPlaneNormal` accepts the standard view plane normal for the
 *   frame geometry (the plane moves less than half a slice across the image);
 * - the acquisition normal and view up point the same way as the standard
 *   ones, so the view is not mirrored or upside down;
 * - an in-plane rotation of the frames moves the image corners by less than
 *   half a pixel.
 *
 * Any other series gets undefined, for example a sagittal MR with a 13 degree
 * tilt of its normal or of its in-plane axes. A request for the standard
 * orientation then reformats to the true axes, as the legacy volume viewport
 * does.
 */
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

  const {
    rows = 1,
    columns = 1,
    rowPixelSpacing = 1,
    columnPixelSpacing = 1,
  } = imagePlaneModule;
  const sliceSpacing =
    imagePlaneModule.spacingBetweenSlices ||
    imagePlaneModule.sliceThickness ||
    1;
  const frameGeometry = {
    direction: [...rowVec, ...colVec, ...scanAxisNormal] as unknown as Mat3,
    dimensions: [columns, rows, 1] as Point3,
    spacing: [columnPixelSpacing, rowPixelSpacing, sliceSpacing] as Point3,
  };

  const standard = MPR_CAMERA_VALUES[orientation];

  if (!isAcquisitionPlaneNormal(frameGeometry, standard.viewPlaneNormal)) {
    return;
  }

  const acquisition = getAcquisitionPlaneOrientation(
    frameGeometry as unknown as IImageVolume
  );
  const upCos = vec3.dot(
    acquisition.viewUp as unknown as vec3,
    standard.viewUp as unknown as vec3
  );
  const upSin = Math.sqrt(Math.max(0, 1 - upCos * upCos));
  const halfDiagonal =
    Math.hypot(columns * columnPixelSpacing, rows * rowPixelSpacing) / 2;

  if (
    vec3.dot(
      acquisition.viewPlaneNormal as unknown as vec3,
      standard.viewPlaneNormal as unknown as vec3
    ) <= 0 ||
    upCos <= 0 ||
    upSin * halfDiagonal >= Math.min(columnPixelSpacing, rowPixelSpacing) / 2
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
