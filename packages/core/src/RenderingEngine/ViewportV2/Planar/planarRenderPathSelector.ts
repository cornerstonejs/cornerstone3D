import { vec3 } from 'gl-matrix';
import cache from '../../../cache/cache';
import { OrientationAxis } from '../../../enums';
import { getShouldUseCPURendering } from '../../../init';
import * as metaData from '../../../metaData';
import { getOrientationFromScanAxisNormal } from '../../helpers/getCameraVectors';
import { isValidVolume } from '../../../utilities/isValidVolume';
import type {
  PlanarOrientation,
  PlanarRenderMode,
  PlanarRegisteredDataSet,
  PlanarSetDataOptions,
  PlanarViewState,
} from './PlanarViewportV2Types';

export const DEFAULT_PLANAR_CPU_VOXEL_THRESHOLD = 64 * 1024 * 1024;

export interface SelectedPlanarRenderPath {
  acquisitionOrientation?: PlanarViewState['orientation'];
  renderMode: PlanarRenderMode;
  volumeId: string;
}

function getVolumeId(dataSet: PlanarRegisteredDataSet): string {
  return dataSet.volumeId || cache.generateVolumeId(dataSet.imageIds);
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

  const orientation = getOrientationFromScanAxisNormal(
    scanAxisNormal as unknown as [number, number, number]
  );

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
  threshold = DEFAULT_PLANAR_CPU_VOXEL_THRESHOLD
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

  if (typeof rows !== 'number' || typeof columns !== 'number') {
    return false;
  }

  return rows * columns * imageIds.length >= threshold;
}

export function selectPlanarRenderPath(
  dataSet: PlanarRegisteredDataSet,
  options: PlanarSetDataOptions = {}
): SelectedPlanarRenderPath {
  if (!dataSet.imageIds.length) {
    throw new Error('[PlanarViewportV2] Cannot attach an empty planar dataset');
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

  if (!isAcquisitionPath) {
    if (!isValidVolume(dataSet.imageIds)) {
      throw new Error(
        '[PlanarViewportV2] Non-acquisition rendering requires a valid volume dataset'
      );
    }

    return {
      acquisitionOrientation,
      renderMode: 'vtkVolume',
      volumeId,
    };
  }

  return {
    acquisitionOrientation,
    renderMode: shouldUseCPU(dataSet.imageIds, options.cpuVoxelThreshold)
      ? 'cpu2d'
      : 'vtkImage',
    volumeId,
  };
}

export function normalizePlanarOrientation(
  orientation: PlanarOrientation | undefined,
  acquisitionOrientation?: PlanarViewState['orientation']
): PlanarViewState['orientation'] {
  if (!orientation || orientation === OrientationAxis.ACQUISITION) {
    return acquisitionOrientation || OrientationAxis.AXIAL;
  }

  return orientation;
}
