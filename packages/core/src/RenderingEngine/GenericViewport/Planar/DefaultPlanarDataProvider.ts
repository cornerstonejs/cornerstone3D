import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { createAndCacheVolume } from '../../../loaders/volumeLoader';
import { ActorRenderMode } from '../../../types';
import resolveViewportVolumeId from '../../helpers/resolveViewportVolumeId';
import type { LoadedData } from '../ViewportArchitectureTypes';
import { getGenericViewportPlanarDataSet } from '../genericViewportDataSetAccess';
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

    // A concrete, clamped index is always needed to load a single image below.
    const clampedImageIdIndex = Math.min(
      Math.max(0, dataSet.initialImageIdIndex ?? 0),
      dataSet.imageIds.length - 1
    );
    // But preserve "no slice requested" (undefined) in the payload so the volume
    // acquisition view can center instead of pinning to slice 0; an explicit
    // index (including 0) is clamped and honored downstream.
    const initialImageIdIndex =
      dataSet.initialImageIdIndex === undefined
        ? undefined
        : clampedImageIdIndex;

    if (
      options.renderMode === ActorRenderMode.VTK_VOLUME_SLICE ||
      options.renderMode === ActorRenderMode.CPU_VOLUME
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
        imageIds,
        initialImageIdIndex,
        acquisitionOrientation: options.acquisitionOrientation,
        imageData: dataSet.imageData,
        imageVolume,
        reference: dataSet.reference,
        renderMode: options.renderMode,
        useWorldCoordinateImageData: dataSet.useWorldCoordinateImageData,
        volumeId,
      };
    }

    const image =
      dataSet.image &&
      dataSet.image.imageId === dataSet.imageIds[clampedImageIdIndex]
        ? dataSet.image
        : await loadAndCacheImage(dataSet.imageIds[clampedImageIdIndex]);

    return {
      id: dataId,
      type: 'image',
      imageIds: dataSet.imageIds,
      image,
      imageData: dataSet.imageData,
      initialImageIdIndex,
      acquisitionOrientation: options.acquisitionOrientation,
      reference: dataSet.reference,
      renderMode: options.renderMode,
      useWorldCoordinateImageData: dataSet.useWorldCoordinateImageData,
      volumeId: options.volumeId,
    };
  }

  private getDataSet(dataId: string): PlanarRegisteredDataSet | undefined {
    const dataSet = getGenericViewportPlanarDataSet(dataId);

    if (!isPlanarRegisteredDataSet(dataSet)) {
      return;
    }

    return dataSet;
  }
}

function isPlanarRegisteredDataSet(
  value: unknown
): value is PlanarRegisteredDataSet {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as PlanarRegisteredDataSet).imageIds) ||
    (value as PlanarRegisteredDataSet).imageIds.length === 0
  ) {
    return false;
  }

  const dataSet = value as PlanarRegisteredDataSet;

  return (
    (dataSet.initialImageIdIndex === undefined ||
      typeof dataSet.initialImageIdIndex === 'number') &&
    (dataSet.volumeId === undefined || typeof dataSet.volumeId === 'string')
  );
}
