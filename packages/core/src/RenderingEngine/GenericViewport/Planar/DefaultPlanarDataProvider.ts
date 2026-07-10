import { loadAndCacheImage } from '../../../loaders/imageLoader';
import { createAndCacheVolume } from '../../../loaders/volumeLoader';
import { ActorRenderMode } from '../../../types';
import resolveViewportVolumeId from '../../helpers/resolveViewportVolumeId';
import type { LoadedData } from '../ViewportArchitectureTypes';
import { getGenericViewportPlanarDisplaySet } from '../genericViewportDisplaySetAccess';
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

      // The volume sorts its imageIds by position along the scan axis, which can
      // reorder (commonly reverse) them relative to the registered dataSet order
      // the caller computed initialImageIdIndex against. Remap the index through
      // the imageId so the payload index addresses the slice the caller asked
      // for in the payload's (volume) ordering.
      let volumeInitialImageIdIndex = initialImageIdIndex;
      if (initialImageIdIndex !== undefined && imageIds !== dataSet.imageIds) {
        const requestedImageId = dataSet.imageIds[initialImageIdIndex];
        const remappedIndex = imageIds.indexOf(requestedImageId);
        if (remappedIndex >= 0) {
          volumeInitialImageIdIndex = remappedIndex;
        }
      }

      return {
        id: dataId,
        type: 'image',
        imageIds,
        initialImageIdIndex: volumeInitialImageIdIndex,
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
    const dataSet = getGenericViewportPlanarDisplaySet(dataId);

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
