import { vec3 } from 'gl-matrix';
import cache from '../../../cache/cache';
import { OrientationAxis } from '../../../enums';
import { getConfiguration, getShouldUseCPURendering } from '../../../init';
import * as metaData from '../../../metaData';
import { ActorRenderMode } from '../../../types';
import { isValidVolume } from '../../../utilities/isValidVolume';
import { getOrientationFromScanAxisNormal } from '../../helpers/getCameraVectors';
import type {
  PlanarViewState,
  PlanarEffectiveRenderMode,
  PlanarOrientation,
  PlanarRegisteredDataSet,
} from './PlanarViewportTypes';

export const DEFAULT_PLANAR_CPU_IMAGE_THRESHOLD = 64 * 1024 * 1024;
export const DEFAULT_PLANAR_CPU_VOLUME_THRESHOLD = 64 * 1024 * 1024;

export interface SelectedPlanarRenderPath {
  acquisitionOrientation?: PlanarViewState['orientation'];
  renderMode: PlanarEffectiveRenderMode;
  volumeId: string;
}

export interface PlanarRenderPathDecisionOptions {
  orientation?: PlanarOrientation;
  cpuThresholds?: {
    image?: number;
    volume?: number;
  };
  useSliceRendering?: boolean;
  webGLAvailable?: boolean;
}

/**
 * Centralizes PlanarViewport render-path decisions.
 *
 * Clean Planar Next callers do not pass a render mode. This service derives the
 * internal path from semantic inputs: dataset shape, requested orientation,
 * runtime CPU/GPU configuration, WebGL availability, and segmentation slice
 * rendering configuration. Binding role is deliberately not part of the
 * decision; source and overlays are mounted through the same rules.
 */
export class PlanarRenderPathDecisionService {
  select(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions = {}
  ): SelectedPlanarRenderPath {
    if (!dataSet.imageIds.length) {
      throw new Error('[PlanarViewport] Cannot add an empty planar dataset');
    }

    const orientation = options.orientation || OrientationAxis.ACQUISITION;
    const acquisitionOrientation = getPlanarAcquisitionOrientation(
      dataSet.imageIds
    );
    const volumeId = getVolumeId(dataSet);
    const isAcquisitionPath =
      orientation === OrientationAxis.ACQUISITION ||
      (acquisitionOrientation !== undefined &&
        orientation === acquisitionOrientation);
    const useVolumePath = isVolumeBackedDataSet(dataSet, isAcquisitionPath);

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
        ? this.selectVolumeRenderMode(dataSet, options)
        : this.selectImageRenderMode(dataSet, options),
      volumeId,
    };
  }

  private selectImageRenderMode(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions
  ): PlanarEffectiveRenderMode {
    return this.shouldUseCPUForImage(dataSet, options)
      ? ActorRenderMode.CPU_IMAGE
      : ActorRenderMode.VTK_IMAGE;
  }

  private selectVolumeRenderMode(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions
  ): PlanarEffectiveRenderMode {
    return this.shouldUseCPUForVolume(dataSet, options)
      ? ActorRenderMode.CPU_VOLUME
      : ActorRenderMode.VTK_VOLUME_SLICE;
  }

  private shouldUseCPUForImage(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions
  ): boolean {
    if (options.webGLAvailable === false) {
      return true;
    }

    const configuredCpuThresholds = getConfiguredPlanarCpuThresholds();

    return shouldUseCPU(
      dataSet.imageIds,
      options.cpuThresholds?.image ??
        configuredCpuThresholds?.image ??
        DEFAULT_PLANAR_CPU_IMAGE_THRESHOLD
    );
  }

  private shouldUseCPUForVolume(
    dataSet: PlanarRegisteredDataSet,
    options: PlanarRenderPathDecisionOptions
  ): boolean {
    if (options.webGLAvailable === false) {
      return true;
    }

    const configuredCpuThresholds = getConfiguredPlanarCpuThresholds();

    return shouldUseCPU(
      dataSet.imageIds,
      options.cpuThresholds?.volume ??
        configuredCpuThresholds?.volume ??
        DEFAULT_PLANAR_CPU_VOLUME_THRESHOLD
    );
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

export function shouldUseCPU(
  imageIds: string[],
  threshold = DEFAULT_PLANAR_CPU_IMAGE_THRESHOLD
): boolean {
  if (getShouldUseCPURendering()) {
    return true;
  }

  const imageId = imageIds[0];

  if (!imageId) {
    return false;
  }

  const imagePlaneModule = metaData.get('imagePlaneModule', imageId);
  const rows = imagePlaneModule?.rows;
  const columns = imagePlaneModule?.columns;

  if (!isPositiveSafeInteger(rows) || !isPositiveSafeInteger(columns)) {
    return false;
  }

  if (!Number.isFinite(threshold)) {
    return false;
  }

  const normalizedThreshold = Math.trunc(threshold);

  if (!Number.isSafeInteger(normalizedThreshold) || normalizedThreshold < 0) {
    return false;
  }

  return (
    BigInt(rows) * BigInt(columns) * BigInt(imageIds.length) >=
    BigInt(normalizedThreshold)
  );
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

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function getConfiguredPlanarCpuThresholds() {
  return getConfiguration().rendering?.planar?.cpuThresholds;
}
