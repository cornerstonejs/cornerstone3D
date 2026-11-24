import cache from '../../../cache/cache';
import { loadAndCacheGeometry } from '../../../loaders/geometryLoader';
import { createAndCacheVolume } from '../../../loaders/volumeLoader';
import toCacheVolumeId from '../../helpers/toCacheVolumeId';
import type { LoadedData } from '../ViewportArchitectureTypes';
import {
  displaySetShapeError,
  getImageDisplaySet,
  getDisplaySetDescriptor,
  isImageDisplaySet,
} from '../displaySetAccess';
import type {
  Volume3DDataProvider,
  Volume3DGeometryPayload,
  Volume3DDisplaySetDescriptor,
  Volume3DVolumePayload,
} from './viewport3DTypes';

export class DefaultVolume3DDataProvider implements Volume3DDataProvider {
  async load(
    displaySetId: string,
    options?: {
      renderMode: 'vtkVolume3d' | 'vtkGeometry3d';
    }
  ): Promise<LoadedData<Volume3DVolumePayload | Volume3DGeometryPayload>> {
    if (!options) {
      throw new Error(
        `[VolumeViewport3D] No load options were provided for ${displaySetId}`
      );
    }

    const dataSet = this.getDataSet(displaySetId);

    if (options.renderMode === 'vtkVolume3d') {
      if (!dataSet?.imageIds?.length) {
        throw displaySetShapeError(
          'VolumeViewport3D',
          displaySetId,
          'imageIds'
        );
      }

      const volumeId = toCacheVolumeId(dataSet.volumeId ?? displaySetId);
      const imageVolume = await createAndCacheVolume(volumeId, {
        imageIds: dataSet.imageIds,
      });
      imageVolume.load();

      return {
        id: displaySetId,
        type: 'image',
        imageIds: imageVolume.imageIds || dataSet.imageIds,
        imageVolume,
        renderMode: 'vtkVolume3d',
        volumeId,
        ...(dataSet.reference ? { reference: dataSet.reference } : {}),
      };
    }

    if (!dataSet && getDisplaySetDescriptor(displaySetId)) {
      throw displaySetShapeError(
        'VolumeViewport3D',
        displaySetId,
        'imageIds or geometryId'
      );
    }

    const geometryId = dataSet?.geometryId || displaySetId;
    const geometry =
      cache.getGeometry(geometryId) ||
      (await loadAndCacheGeometry(geometryId, dataSet?.geometryLoadOptions));

    return {
      id: displaySetId,
      type: 'geometry',
      geometry,
      geometryId,
      renderMode: 'vtkGeometry3d',
      ...(dataSet?.reference ? { reference: dataSet.reference } : {}),
    };
  }

  /**
   * The registered display set of `displaySetId`: one with image ids, or a
   * geometry display set with a `geometryId` and no image ids.
   */
  private getDataSet(
    displaySetId: string
  ): Volume3DDisplaySetDescriptor | undefined {
    const dataSet =
      getImageDisplaySet(displaySetId) ?? getDisplaySetDescriptor(displaySetId);

    if (!isVolume3DDisplaySetDescriptor(dataSet)) {
      return;
    }

    return dataSet;
  }
}

/**
 * Whether a registered value is a display set that a 3D viewport loads: a
 * record with image ids, or a record with a `geometryId` and no image ids.
 */
function isVolume3DDisplaySetDescriptor(
  value: unknown
): value is Volume3DDisplaySetDescriptor {
  if (!isImageDisplaySet(value) && !isGeometryDataSet(value)) {
    return false;
  }

  return (
    (value.geometryId === undefined || typeof value.geometryId === 'string') &&
    (value.volumeId === undefined || typeof value.volumeId === 'string') &&
    (value.geometryLoadOptions === undefined ||
      (typeof value.geometryLoadOptions === 'object' &&
        !Array.isArray(value.geometryLoadOptions)))
  );
}

/** Whether a registered value is a record that names a geometry and no images. */
function isGeometryDataSet(
  value: unknown
): value is Record<string, unknown> & { geometryId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).geometryId === 'string' &&
    (value as Record<string, unknown>).imageIds === undefined
  );
}
