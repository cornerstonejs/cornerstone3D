import { vec3 } from 'gl-matrix';
import cache from '../../../cache/cache';
import { OrientationAxis } from '../../../enums';
import { getConfiguration, getShouldUseCPURendering } from '../../../init';
import * as metaData from '../../../metaData';
import { getOrientationFromScanAxisNormal } from '../../helpers/getCameraVectors';
import { isValidVolume } from '../../../utilities/isValidVolume';
import type {
  PlanarCamera,
  PlanarEffectiveRenderMode,
  PlanarOrientation,
  PlanarRenderMode,
  PlanarRegisteredDataSet,
  PlanarSetDataOptions,
} from './PlanarViewportV2Types';
import { clonePlanarOrientation } from './planarLegacyCompatibility';

export const DEFAULT_PLANAR_CPU_IMAGE_THRESHOLD = 64 * 1024 * 1024;
export const DEFAULT_PLANAR_CPU_VOLUME_THRESHOLD = 64 * 1024 * 1024;

export interface SelectedPlanarRenderPath {
  acquisitionOrientation?: PlanarCamera['orientation'];
  renderMode: PlanarEffectiveRenderMode;
  volumeId: string;
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

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function getPlanarAcquisitionOrientation(
  imageIds: string[]
): PlanarCamera['orientation'] | undefined {
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

function getConfiguredPlanarCpuThresholds() {
  return getConfiguration().rendering?.planar?.cpuThresholds;
}

export function selectPlanarRenderPath(
  dataSet: PlanarRegisteredDataSet,
  options: PlanarSetDataOptions = {}
): SelectedPlanarRenderPath {
  if (!dataSet.imageIds.length) {
    throw new Error('[PlanarViewportV2] Cannot add an empty planar dataset');
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
  const requestedRenderMode = options.renderMode ?? 'auto';
  const configuredCpuThresholds = getConfiguredPlanarCpuThresholds();
  const shouldUseCpuImagePath = shouldUseCPU(
    dataSet.imageIds,
    options.cpuThresholds?.image ??
      configuredCpuThresholds?.image ??
      DEFAULT_PLANAR_CPU_IMAGE_THRESHOLD
  );
  const shouldUseCpuVolumePath = shouldUseCPU(
    dataSet.imageIds,
    options.cpuThresholds?.volume ??
      configuredCpuThresholds?.volume ??
      DEFAULT_PLANAR_CPU_VOLUME_THRESHOLD
  );

  if (requestedRenderMode !== 'auto') {
    if (requestedRenderMode === 'cpu2d' || requestedRenderMode === 'vtkImage') {
      if (!isAcquisitionPath) {
        throw new Error(
          '[PlanarViewportV2] cpu2d and vtkImage render modes require the acquisition plane'
        );
      }

      return {
        acquisitionOrientation,
        renderMode: requestedRenderMode,
        volumeId,
      };
    }

    if (!supportsVolumeRendering(dataSet)) {
      throw new Error(
        '[PlanarViewportV2] Volume rendering requires a valid volume dataset'
      );
    }

    return {
      acquisitionOrientation,
      renderMode: requestedRenderMode,
      volumeId,
    };
  }

  if (!isAcquisitionPath) {
    if (!supportsVolumeRendering(dataSet)) {
      throw new Error(
        '[PlanarViewportV2] Non-acquisition rendering requires a valid volume dataset'
      );
    }

    return {
      acquisitionOrientation,
      renderMode: shouldUseCpuVolumePath ? 'cpuVolume' : 'vtkVolume',
      volumeId,
    };
  }

  return {
    acquisitionOrientation,
    renderMode: shouldUseCpuImagePath ? 'cpu2d' : 'vtkImage',
    volumeId,
  };
}

export function normalizePlanarOrientation(
  orientation: PlanarOrientation | undefined,
  acquisitionOrientation?: PlanarCamera['orientation']
): PlanarCamera['orientation'] {
  if (!orientation || orientation === OrientationAxis.ACQUISITION) {
    return OrientationAxis.ACQUISITION;
  }

  if (acquisitionOrientation && orientation === acquisitionOrientation) {
    return OrientationAxis.ACQUISITION;
  }

  return clonePlanarOrientation(orientation);
}
