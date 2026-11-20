import cache from '../../../cache/cache';
import { loadAndCacheGeometry } from '../../../loaders/geometryLoader';
import { createAndCacheVolume } from '../../../loaders/volumeLoader';
import resolveViewportVolumeId from '../../helpers/resolveViewportVolumeId';
import type { LoadedData } from '../ViewportArchitectureTypes';
import {
  getGenericViewportImageDisplaySet,
  getGenericViewportRegisteredDisplaySet,
  isGenericViewportImageDisplaySet,
} from '../genericViewportDisplaySetAccess';
import type {
  Volume3DDataProvider,
  Volume3DGeometryPayload,
  Volume3DRegisteredDataSet,
  Volume3DVolumePayload,
} from './viewport3DTypes';

export class DefaultVolume3DDataProvider implements Volume3DDataProvider {
  async load(
    dataId: string,
    options?: {
      renderMode: 'vtkVolume3d' | 'vtkGeometry3d';
    }
  ): Promise<LoadedData<Volume3DVolumePayload | Volume3DGeometryPayload>> {
    if (!options) {
      throw new Error(
        `[VolumeViewport3D] No load options were provided for ${dataId}`
      );
    }

    const dataSet = this.getDataSet(dataId);

    if (options.renderMode === 'vtkVolume3d') {
      if (!dataSet?.imageIds?.length) {
        throw new Error(
          `[VolumeViewport3D] No registered volume dataset for ${dataId}`
        );
      }

      const volumeId = resolveViewportVolumeId(dataSet.volumeId ?? dataId);
      const imageVolume = await createAndCacheVolume(volumeId, {
        imageIds: dataSet.imageIds,
      });
      imageVolume.load();

      return {
        id: dataId,
        type: 'image',
        imageIds: imageVolume.imageIds || dataSet.imageIds,
        imageVolume,
        renderMode: 'vtkVolume3d',
        volumeId,
        ...(dataSet.reference ? { reference: dataSet.reference } : {}),
      };
    }

    const geometryId = dataSet?.geometryId || dataId;
    const geometry =
      cache.getGeometry(geometryId) ||
      (await loadAndCacheGeometry(geometryId, dataSet?.geometryLoadOptions));

    return {
      id: dataId,
      type: 'geometry',
      geometry,
      geometryId,
      renderMode: 'vtkGeometry3d',
      ...(dataSet?.reference ? { reference: dataSet.reference } : {}),
    };
  }

  /**
   * The registered display set of `dataId`: one with image ids, or a
   * geometry display set with a `geometryId` and no image ids.
   */
  private getDataSet(dataId: string): Volume3DRegisteredDataSet | undefined {
    const dataSet =
      getGenericViewportImageDisplaySet(dataId) ??
      getGenericViewportRegisteredDisplaySet(dataId);

    if (!isVolume3DRegisteredDataSet(dataSet)) {
      return;
    }

    return dataSet;
  }
}

/**
 * Whether a registered value is a display set that a 3D viewport loads: a
 * record with image ids, or a record with a `geometryId` and no image ids.
 */
function isVolume3DRegisteredDataSet(
  value: unknown
): value is Volume3DRegisteredDataSet {
  if (!isGenericViewportImageDisplaySet(value) && !isGeometryDataSet(value)) {
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
