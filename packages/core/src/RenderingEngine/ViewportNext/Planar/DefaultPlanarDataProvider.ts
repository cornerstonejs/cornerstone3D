import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { createAndCacheVolume } from '../../../loaders/volumeLoader';
import resolveViewportVolumeId from '../../helpers/resolveViewportVolumeId';
import type { LoadedData } from '../ViewportArchitectureTypes';
import {
  getViewportNextImageDataSet,
  isViewportNextImageDataSet,
} from '../viewportNextDataSetAccess';
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
      options.renderMode === 'vtkVolumeSlice' ||
      options.renderMode === 'cpuVolume'
    ) {
      const volumeId = resolveViewportVolumeId(options.volumeId);
      const imageVolume = await createAndCacheVolume(volumeId, {
        imageIds: dataSet.imageIds,
      });
      imageVolume.load();
      const imageIds = imageVolume.imageIds
        ? imageVolume.imageIds
        : dataSet.imageIds;

      return {
        id: dataId,
        type: 'image',
        actorUID: dataSet.actorUID,
        imageIds,
        initialImageIdIndex: clampedImageIdIndex,
        acquisitionOrientation: options.acquisitionOrientation,
        imageVolume,
        referencedId: dataSet.referencedId,
        renderMode: options.renderMode,
        representationUID: dataSet.representationUID,
        volumeId,
      };
    }

    const image = await loadAndCacheImage(
      dataSet.imageIds[clampedImageIdIndex]
    );

    return {
      id: dataId,
      type: 'image',
      actorUID: dataSet.actorUID,
      imageIds: dataSet.imageIds,
      image,
      initialImageIdIndex: clampedImageIdIndex,
      acquisitionOrientation: options.acquisitionOrientation,
      referencedId: dataSet.referencedId,
      renderMode: options.renderMode,
      representationUID: dataSet.representationUID,
      volumeId: options.volumeId,
    };
  }

  private getDataSet(dataId: string): PlanarRegisteredDataSet | undefined {
    const dataSet = getViewportNextImageDataSet(dataId);

    if (!isPlanarRegisteredDataSet(dataSet)) {
      return;
    }

    return dataSet;
  }
}

function isPlanarRegisteredDataSet(
  value: unknown
): value is PlanarRegisteredDataSet {
  if (!isViewportNextImageDataSet(value) || value.imageIds.length === 0) {
    return false;
  }

  return (
    (value.initialImageIdIndex === undefined ||
      typeof value.initialImageIdIndex === 'number') &&
    (value.volumeId === undefined || typeof value.volumeId === 'string')
  );
}
