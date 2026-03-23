import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { createAndCacheVolume } from '../../../loaders/volumeLoader';
import type { LoadedData } from '../ViewportArchitectureTypes';
import {
  getViewportV2ImageDataSet,
  isViewportV2ImageDataSet,
} from '../viewportV2DataSetAccess';
import type {
  PlanarDataProvider,
  PlanarDataLoadOptions,
  PlanarPayload,
  PlanarRegisteredDataSet,
} from './PlanarViewportTypes';

export class DefaultPlanarDataProvider implements PlanarDataProvider {
  async load(
    dataId: string,
    options?: PlanarDataLoadOptions
  ): Promise<LoadedData<PlanarPayload>> {
    const dataSet = this.getDataSet(dataId);

    if (!dataSet) {
      throw new Error(
        `[PlanarViewport] No registered planar dataset for ${dataId}`
      );
    }

    if (!options) {
      throw new Error(
        `[PlanarViewport] No load options were provided for ${dataId}`
      );
    }

    if (!dataSet.imageIds.length) {
      throw new Error('[PlanarViewport] Cannot load an empty planar dataset');
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
        imageIds: imageVolume.imageIds || dataSet.imageIds,
        initialImageIdIndex: clampedImageIdIndex,
        acquisitionOrientation: options.acquisitionOrientation,
        imageVolume,
        renderMode: options.renderMode,
        volumeId,
      };
    }

    const image = await loadAndCacheImage(
      dataSet.imageIds[clampedImageIdIndex]
    );

    return {
      id: dataId,
      type: 'image',
      imageIds: dataSet.imageIds,
      image,
      initialImageIdIndex: clampedImageIdIndex,
      acquisitionOrientation: options.acquisitionOrientation,
      renderMode: options.renderMode,
      volumeId: options.volumeId,
    };
  }

  private getDataSet(dataId: string): PlanarRegisteredDataSet | undefined {
    const dataSet = getViewportV2ImageDataSet(dataId);

    if (!isPlanarRegisteredDataSet(dataSet)) {
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

function isPlanarRegisteredDataSet(
  value: unknown
): value is PlanarRegisteredDataSet {
  if (!isViewportV2ImageDataSet(value) || value.imageIds.length === 0) {
    return false;
  }

  return (
    (value.initialImageIdIndex === undefined ||
      typeof value.initialImageIdIndex === 'number') &&
    (value.volumeId === undefined || typeof value.volumeId === 'string')
  );
}
