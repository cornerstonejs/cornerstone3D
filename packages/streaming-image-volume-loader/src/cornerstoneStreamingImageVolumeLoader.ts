import {
  Enums,
  imageLoader,
  imageLoadPoolManager,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import StreamingImageVolume from './StreamingImageVolume';

interface IVolumeLoader {
  promise: Promise<StreamingImageVolume>;
  cancel: () => void;
  decache: () => void;
}

/**
 * It handles loading of a image by streaming in its imageIds. It will be the
 * volume loader if the schema for the volumeID is `cornerstoneStreamingImageVolume`.
 * This function returns a promise that resolves to the StreamingImageVolume instance.
 *
 * In order to use the cornerstoneStreamingImageVolumeLoader you should use
 * createAndCacheVolume helper from the cornerstone-core volumeLoader module.
 *
 * @param volumeId - The ID of the volume
 * @param options - options for loading, imageIds
 * @returns a promise that resolves to a StreamingImageVolume
 */
function cornerstoneStreamingImageVolumeLoader(
  volumeId: string,
  options: {
    imageIds: string[];
    progressiveRendering?: boolean | Types.IRetrieveConfiguration;
  }
): IVolumeLoader {
  if (!options || !options.imageIds || !options.imageIds.length) {
    throw new Error(
      'ImageIds must be provided to create a streaming image volume'
    );
  }

  async function getStreamingImageVolume() {
    /**
     * Check if we are using the `wadouri:` scheme, and if so, preload first,
     * middle, and last image metadata as these are the images the current
     * streaming image loader may explicitly request metadata from. The last image
     * metadata would only be specifically requested if the imageId array order is
     * reversed in the `sortImageIdsAndGetSpacing.ts` file.
     */
    if (options.imageIds[0].split(':')[0] === 'wadouri') {
      const [middleImageIndex, lastImageIndex] = [
        Math.floor(options.imageIds.length / 2),
        options.imageIds.length - 1,
      ];
      const indexesToPrefetch = [0, middleImageIndex, lastImageIndex];
      await Promise.all(
        indexesToPrefetch.map((index) => {
          return new Promise((resolve, reject) => {
            const imageId = options.imageIds[index];
            imageLoadPoolManager.addRequest(
              async () => {
                imageLoader
                  .loadImage(imageId)
                  .then(() => {
                    console.log(`Prefetched imageId: ${imageId}`);
                    resolve(true);
                  })
                  .catch((err) => {
                    reject(err);
                  });
              },
              Enums.RequestType.Prefetch,
              { volumeId },
              1 // priority
            );
          });
        })
      ).catch(console.error);
    }

    const {
      dimensions,
      spacing,
      origin,
      scalarData,
      direction,
      sizeInBytes,
      metadata,
      imageIds,
    } = csUtils.generateVolumePropsFromImageIds(options.imageIds, volumeId);

    const streamingImageVolume = new StreamingImageVolume(
      // ImageVolume properties
      {
        volumeId,
        metadata,
        dimensions,
        spacing,
        origin,
        direction,
        scalarData,
        sizeInBytes,
        imageIds,
      },
      // Streaming properties
      {
        imageIds,
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

    return streamingImageVolume;
  }

  const streamingImageVolumePromise = getStreamingImageVolume();

  return {
    promise: streamingImageVolumePromise,
    decache: () => {
      streamingImageVolumePromise.then((streamingImageVolume) => {
        streamingImageVolume.destroy();
        streamingImageVolume = null;
      });
    },
    cancel: () => {
      streamingImageVolumePromise.then((streamingImageVolume) => {
        streamingImageVolume.cancelLoading();
      });
    },
  };
}

export default cornerstoneStreamingImageVolumeLoader;
