import { utilities } from '@cornerstonejs/core';
import { splitImageIdsBy4DTags } from './helpers';
import StreamingDynamicImageVolume from './StreamingDynamicImageVolume';
import type { vec3 } from 'gl-matrix';

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
  const volumeProps = utilities.generateVolumePropsFromImageIds(
    imageIdGroups[0],
    volumeId
  );
  const {
    metadata: volumeMetadata,
    dimensions,
    spacing,
    direction,
    sizeInBytes,
    origin,
  } = volumeProps;

  const scanAxisNormal = direction.slice(6, 9) as vec3;

  const sortedImageIdGroups = imageIdGroups.map((imageIds) => {
    const sortedImageIds = utilities.sortImageIdsAndGetSpacing(
      imageIds,
      scanAxisNormal
    ).sortedImageIds;

    return sortedImageIds;
  });

  const sortedFlatImageIds = sortedImageIdGroups.flat();

  const voxelManager =
    utilities.VoxelManager.createScalarDynamicVolumeVoxelManager({
      dimensions,
      imageIdGroups: sortedImageIdGroups,
      timePoint: 0,
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

export default cornerstoneStreamingDynamicImageVolumeLoader;
