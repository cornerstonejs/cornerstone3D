import cache from '../../../cache/cache';
import { loadAndCacheGeometry } from '../../../loaders/geometryLoader';
import { createAndCacheVolume } from '../../../loaders/volumeLoader';
import type { LogicalDataObject } from '../ViewportArchitectureTypes';
import { getViewportV2ImageDataSet } from '../viewportV2DataSetAccess';
import type {
  Volume3DDataProvider,
  Volume3DGeometryPayload,
  Volume3DRegisteredDataSet,
  Volume3DVolumePayload,
} from './3dViewportTypes';

const STREAMING_VOLUME_LOADER_SCHEME = 'cornerstoneStreamingImageVolume';

export class DefaultVolume3DDataProvider implements Volume3DDataProvider {
  async load(
    dataId: string,
    options?: {
      renderMode: 'vtkVolume3d' | 'vtkGeometry3d';
    }
  ): Promise<
    LogicalDataObject<Volume3DVolumePayload | Volume3DGeometryPayload>
  > {
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

      const volumeId = getStreamingVolumeId(dataSet.volumeId || dataId);
      const imageVolume = await createAndCacheVolume(volumeId, {
        imageIds: dataSet.imageIds,
      });
      imageVolume.load();

      return {
        type: 'image',
        payload: {
          actorUID: dataSet.actorUID,
          imageIds: imageVolume.imageIds || dataSet.imageIds,
          imageVolume,
          renderMode: 'vtkVolume3d',
          volumeId,
        },
      };
    }

    const geometryId = dataSet?.geometryId || dataId;
    const geometry =
      cache.getGeometry(geometryId) ||
      (await loadAndCacheGeometry(geometryId, dataSet?.geometryLoadOptions));

    return {
      type: 'geometry',
      payload: {
        geometry,
        geometryId,
        renderMode: 'vtkGeometry3d',
      },
    };
  }

  private getDataSet(dataId: string): Volume3DRegisteredDataSet | undefined {
    return getViewportV2ImageDataSet<Volume3DRegisteredDataSet>(dataId);
  }
}

function getStreamingVolumeId(volumeId: string): string {
  if (volumeId.startsWith(`${STREAMING_VOLUME_LOADER_SCHEME}:`)) {
    return volumeId;
  }

  if (volumeId.includes(':')) {
    return volumeId;
  }

  return `${STREAMING_VOLUME_LOADER_SCHEME}:${volumeId}`;
}
