import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { createAndCacheVolumeFromImages } from '../../../loaders/volumeLoader';
import * as metaData from '../../../metaData';
import viewportV2DataSetMetadataProvider from '../../../utilities/viewportV2DataSetMetadataProvider';
import type { LogicalDataObject } from '../ViewportArchitectureTypes';
import type {
  PlanarDataProvider,
  PlanarDataLoadOptions,
  PlanarPayload,
  PlanarRegisteredDataSet,
} from './PlanarViewportV2Types';

export class DefaultPlanarDataProvider implements PlanarDataProvider {
  private getDataSet(dataId: string): PlanarRegisteredDataSet | undefined {
    const registered = metaData.get(
      viewportV2DataSetMetadataProvider.VIEWPORT_V2_DATA_SET,
      dataId
    );

    if (Array.isArray(registered)) {
      return {
        imageIds: registered,
      };
    }

    const candidate = registered as PlanarRegisteredDataSet | undefined;

    if (!candidate?.imageIds) {
      return;
    }

    return candidate;
  }

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
      const imageVolume = await createAndCacheVolumeFromImages(
        options.volumeId,
        dataSet.imageIds
      );

      return {
        id: dataId,
        role: 'image',
        kind: 'imageVolume',
        metadata: {
          imageIds: imageVolume.imageIds || dataSet.imageIds,
          initialImageIdIndex: clampedImageIdIndex,
          acquisitionOrientation: options.acquisitionOrientation,
          volumeId: options.volumeId,
        },
        payload: {
          imageIds: imageVolume.imageIds || dataSet.imageIds,
          initialImageIdIndex: clampedImageIdIndex,
          acquisitionOrientation: options.acquisitionOrientation,
          imageVolume,
          renderMode: options.renderMode,
          volumeId: options.volumeId,
        },
      };
    }

    const initialImage = await loadAndCacheImage(
      dataSet.imageIds[clampedImageIdIndex]
    );

    return {
      id: dataId,
      role: 'image',
      kind: 'imageStack',
      metadata: {
        imageIds: dataSet.imageIds,
        initialImageIdIndex: clampedImageIdIndex,
        imageId: initialImage.imageId,
        acquisitionOrientation: options.acquisitionOrientation,
        volumeId: options.volumeId,
      },
      payload: {
        imageIds: dataSet.imageIds,
        initialImage,
        initialImageIdIndex: clampedImageIdIndex,
        acquisitionOrientation: options.acquisitionOrientation,
        renderMode: options.renderMode,
        volumeId: options.volumeId,
      },
    };
  }
}
