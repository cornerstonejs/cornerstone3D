import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { createAndCacheVolume } from '../../../loaders/volumeLoader';
import type { LogicalDataObject } from '../ViewportArchitectureTypes';
import { getViewportV2ImageDataSet } from '../viewportV2DataSetAccess';
import type {
  PlanarDataProvider,
  PlanarDataLoadOptions,
  PlanarPayload,
  PlanarRegisteredDataSet,
} from './PlanarViewportV2Types';

export class DefaultPlanarDataProvider implements PlanarDataProvider {
  async load(
    dataId: string,
    options?: PlanarDataLoadOptions
  ): Promise<LogicalDataObject<PlanarPayload>> {
    const dataSet = this.getDataSet(dataId);

    if (!dataSet) {
      throw new Error(
        `[PlanarViewportV2] No registered planar dataset for ${dataId}`
      );
    }

    if (!options) {
      throw new Error(
        `[PlanarViewportV2] No load options were provided for ${dataId}`
      );
    }

    if (!dataSet.imageIds.length) {
      throw new Error('[PlanarViewportV2] Cannot load an empty planar dataset');
    }

    const clampedImageIdIndex = Math.min(
      Math.max(0, dataSet.initialImageIdIndex ?? 0),
      dataSet.imageIds.length - 1
    );

    if (
      options.renderMode === 'vtkVolume' ||
      options.renderMode === 'cpuVolume'
    ) {
      const volumeId = getStreamingVolumeId(options.volumeId);
      const imageVolume = await createAndCacheVolume(volumeId, {
        imageIds: dataSet.imageIds,
      });
      imageVolume.load();

      return {
        id: dataId,
        type: 'image',
        metadata: {
          imageIds: imageVolume.imageIds || dataSet.imageIds,
          initialImageIdIndex: clampedImageIdIndex,
          acquisitionOrientation: options.acquisitionOrientation,
          volumeId,
        },
        payload: {
          imageIds: imageVolume.imageIds || dataSet.imageIds,
          initialImageIdIndex: clampedImageIdIndex,
          acquisitionOrientation: options.acquisitionOrientation,
          imageVolume,
          renderMode: options.renderMode,
          volumeId,
        },
      };
    }

    const image = await loadAndCacheImage(
      dataSet.imageIds[clampedImageIdIndex]
    );

    return {
      id: dataId,
      type: 'image',
      metadata: {
        imageIds: dataSet.imageIds,
        initialImageIdIndex: clampedImageIdIndex,
        imageId: image.imageId,
        acquisitionOrientation: options.acquisitionOrientation,
        volumeId: options.volumeId,
      },
      payload: {
        imageIds: dataSet.imageIds,
        image,
        initialImageIdIndex: clampedImageIdIndex,
        acquisitionOrientation: options.acquisitionOrientation,
        renderMode: options.renderMode,
        volumeId: options.volumeId,
      },
    };
  }

  private getDataSet(dataId: string): PlanarRegisteredDataSet | undefined {
    const dataSet = getViewportV2ImageDataSet<PlanarRegisteredDataSet>(dataId);

    if (!dataSet?.imageIds) {
      return;
    }

    return dataSet;
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

const STREAMING_VOLUME_LOADER_SCHEME = 'cornerstoneStreamingImageVolume';
