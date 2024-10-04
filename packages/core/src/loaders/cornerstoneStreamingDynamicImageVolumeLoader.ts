import type { vec3 } from 'gl-matrix';
import { StreamingDynamicImageVolume } from '../cache';
import {
  generateVolumePropsFromImageIds,
  sortImageIdsAndGetSpacing,
  splitImageIdsBy4DTags,
  VoxelManager,
} from '../utilities';

interface IVolumeLoader {
  promise: Promise<StreamingDynamicImageVolume>;
  cancel: () => void;
  decache: () => void;
}

/**
 * It handles loading of a image by streaming in its imageIds. It will be the
 * volume loader if the schema for the volumeID is `cornerstoneStreamingImageVolume`.
 * This function returns a promise that resolves to the StreamingDynamicImageVolume instance.
 *
 * In order to use the cornerstoneStreamingDynamicImageVolumeLoader you should use
 * createAndCacheVolume helper from the cornerstone-core volumeLoader module.
 *
 * @param volumeId - The ID of the volume
 * @param options - options for loading, imageIds
 * @returns a promise that resolves to a StreamingDynamicImageVolume
 */
function cornerstoneStreamingDynamicImageVolumeLoader(
  volumeId: string,
  options: {
    imageIds: string[];
  }
): IVolumeLoader {
  if (!options || !options.imageIds || !options.imageIds.length) {
    throw new Error(
      'ImageIds must be provided to create a 4D streaming image volume'
    );
  }

  const { imageIds } = options;
  const { splittingTag, imageIdGroups } = splitImageIdsBy4DTags(imageIds);
  const middleIndex = Math.floor(imageIdGroups.length / 2);
  const volumeProps = generateVolumePropsFromImageIds(
    imageIdGroups[middleIndex],
    volumeId
  );
  const {
    metadata: volumeMetadata,
    dimensions,
    spacing,
    direction,
    sizeInBytes,
    origin,
    numberOfComponents,
    dataType,
  } = volumeProps;

  const scanAxisNormal = direction.slice(6, 9) as vec3;

  const sortedImageIdGroups = imageIdGroups.map((imageIds) => {
    const sortedImageIds = sortImageIdsAndGetSpacing(
      imageIds,
      scanAxisNormal
    ).sortedImageIds;

    return sortedImageIds;
  });

  const sortedFlatImageIds = sortedImageIdGroups.flat();

  const voxelManager = VoxelManager.createScalarDynamicVolumeVoxelManager({
    dimensions,
    imageIdGroups: sortedImageIdGroups,
    timePoint: 0,
    numberOfComponents,
  });

  let streamingImageVolume = new StreamingDynamicImageVolume(
    // ImageVolume properties
    {
      volumeId,
      metadata: volumeMetadata,
      dimensions,
      spacing,
      origin,
      direction,
      sizeInBytes,
      imageIds: sortedFlatImageIds,
      imageIdGroups: sortedImageIdGroups,
      splittingTag,
      voxelManager,
      numberOfComponents,
      dataType,
    },
    // Streaming properties
    {
      imageIds: sortedFlatImageIds,
      loadStatus: {
        // todo: loading and loaded should be on ImageVolume
        loaded: false,
        loading: false,
        cancelled: false,
        cachedFrames: [],
        callbacks: [],
      },
    }
  );

  return {
    promise: Promise.resolve(streamingImageVolume),
    decache: () => {
      streamingImageVolume.destroy();
      streamingImageVolume = null;
    },
    cancel: () => {
      streamingImageVolume.cancelLoading();
    },
  };
}

export { cornerstoneStreamingDynamicImageVolumeLoader };
