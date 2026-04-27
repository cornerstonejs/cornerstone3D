import cache from '../../../cache/cache';
import { loadAndCacheGeometry } from '../../../loaders/geometryLoader';
import { createAndCacheVolume } from '../../../loaders/volumeLoader';
import resolveViewportVolumeId from '../../helpers/resolveViewportVolumeId';
import type { LoadedData } from '../ViewportArchitectureTypes';
import {
  getViewportNextImageDataSet,
  isViewportNextImageDataSet,
} from '../viewportNextDataSetAccess';
import type {
  Volume3DDataProvider,
  Volume3DGeometryPayload,
  Volume3DRegisteredDataSet,
  Volume3DVolumePayload,
} from './3dViewportTypes';

export class DefaultVolume3DDataProvider implements Volume3DDataProvider {
  async load(
    dataId: string,
    options?: {
      renderMode: 'vtkVolume3d' | 'vtkGeometry3d';
    }
  ): Promise<LoadedData<Volume3DVolumePayload | Volume3DGeometryPayload>> {
    if (!options) {
      throw new Error(
        `[VolumeViewport3DV2] No load options were provided for ${dataId}`
      );
    }

    const dataSet = this.getDataSet(dataId);

    if (options.renderMode === 'vtkVolume3d') {
      if (!dataSet?.imageIds?.length) {
        throw new Error(
          `[VolumeViewport3DV2] No registered volume dataset for ${dataId}`
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
    };
  }

  private getDataSet(dataId: string): Volume3DRegisteredDataSet | undefined {
    const dataSet = getViewportNextImageDataSet(dataId);

    if (!isVolume3DRegisteredDataSet(dataSet)) {
      return;
    }

    return dataSet;
  }
}

function isVolume3DRegisteredDataSet(
  value: unknown
): value is Volume3DRegisteredDataSet {
  if (!isViewportNextImageDataSet(value)) {
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
