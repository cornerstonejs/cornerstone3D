import { createAndCacheVolume } from '../../../loaders/volumeLoader';
import { isVolumeRenderMode } from '../../helpers/renderBackendRegistry';
import toCacheVolumeId from '../../helpers/toCacheVolumeId';
import type { IImage } from '../../../types';
import type { LoadedData } from '../ViewportArchitectureTypes';
import { displaySetShapeError, getImageDisplaySet } from '../displaySetAccess';
import { coreLog } from '../../../utilities/logger';
import type {
  PlanarDataProvider,
  PlanarDataLoadOptions,
  PlanarPayload,
  PlanarDisplaySetDescriptor,
} from './PlanarViewportTypes';
import { loadPlanarStackImage } from './planarStackImageLoad';

const log = coreLog.getLogger('RenderingEngine', 'DefaultPlanarDataProvider');

export class DefaultPlanarDataProvider implements PlanarDataProvider {
  async load(
    displaySetId: string,
    options?: PlanarDataLoadOptions
  ): Promise<LoadedData<PlanarPayload>> {
    const dataSet = this.getDataSet(displaySetId);

    if (!dataSet) {
      throw displaySetShapeError('PlanarViewport', displaySetId, 'imageIds');
    }

    if (!options) {
      throw new Error(
        `[PlanarViewport] No load options were provided for ${displaySetId}`
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

    if (isVolumeRenderMode(options.renderMode)) {
      const volumeId = toCacheVolumeId(options.volumeId);
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
        } else {
          log.warn(
            `[PlanarViewport] initialImageIdIndex remap failed: imageId ` +
              `"${requestedImageId}" not found in the volume imageIds; ` +
              `using the original index ${initialImageIdIndex}`
          );
        }
      }

      return {
        id: displaySetId,
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
        : await loadFirstStackImage(dataSet.imageIds, clampedImageIdIndex);

    return {
      id: displaySetId,
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

  private getDataSet(
    displaySetId: string
  ): PlanarDisplaySetDescriptor | undefined {
    const dataSet = getImageDisplaySet(displaySetId);

    if (!isPlanarDisplaySetDescriptor(dataSet)) {
      return;
    }

    return dataSet;
  }
}

function isPlanarDisplaySetDescriptor(
  value: unknown
): value is PlanarDisplaySetDescriptor {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as PlanarDisplaySetDescriptor).imageIds) ||
    (value as PlanarDisplaySetDescriptor).imageIds.length === 0
  ) {
    return false;
  }

  const dataSet = value as PlanarDisplaySetDescriptor;

  return (
    (dataSet.initialImageIdIndex === undefined ||
      typeof dataSet.initialImageIdIndex === 'number') &&
    (dataSet.volumeId === undefined || typeof dataSet.volumeId === 'string')
  );
}

/**
 * Loads the first image of a stack as the legacy stack viewport loads it,
 * through `loadPlanarStackImage`. It resolves with the first image that
 * arrives, before the better stages of a progressive load, and rejects when
 * the load fails.
 */
function loadFirstStackImage(
  imageIds: string[],
  imageIdIndex: number
): Promise<IImage> {
  return new Promise((resolve, reject) => {
    void loadPlanarStackImage({
      imageIds,
      imageIdIndex,
      onImage: resolve,
      onError: (failure) => reject(failure.error),
    });
  });
}
