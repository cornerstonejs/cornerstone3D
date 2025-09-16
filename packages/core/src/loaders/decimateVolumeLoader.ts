import cache from '../cache/cache';
import StreamingImageVolume from '../cache/classes/StreamingImageVolume';
import { RequestType } from '../enums';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import type { IRetrieveConfiguration } from '../types';
import { generateVolumePropsFromImageIds } from '../utilities/generateVolumePropsFromImageIds';
import { loadImage } from './imageLoader';
import decimate from '../utilities/decimate';
import decimateImagePixels from '../utilities/decimateImagePixels';

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
 *
 * @param volumeId - The ID of the volume
 * @param options - options for loading, imageIds
 * @returns a promise that resolves to a StreamingImageVolume
 */
export function decimateVolumeLoader(
  volumeId: string,
  options: {
    imageIds: string[];
    progressiveRendering?: boolean | IRetrieveConfiguration;
    kDecimation?: number; // New optional parameter for decimation factor
    iDecimation?: number; // New optional parameter for in-plane decimation
  }
): IVolumeLoader {
  if (!options || !options.imageIds || !options.imageIds.length) {
    throw new Error(
      'ImageIds must be provided to create a streaming image volume'
    );
  }

  const sliceDecimation =
    options.kDecimation && options.kDecimation > 1 ? options.kDecimation : 1;
  const inPlaneDecimation =
    options.iDecimation && options.iDecimation > 1 ? options.iDecimation : 1;

  const originalImageIds = options.imageIds.slice();
  const decimatedResult = decimate(originalImageIds, options.kDecimation);

  const decimatedImageIds =
    Array.isArray(decimatedResult) &&
    decimatedResult.length &&
    typeof decimatedResult[0] === 'number'
      ? decimatedResult.map((idx) => originalImageIds[idx])
      : decimatedResult;

  options.imageIds = decimatedImageIds;

  async function loadImageDecimated(imageId: string) {
    const img = await loadImage(imageId);
    return decimateImagePixels(img, inPlaneDecimation);
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
          // check if image is cached
          if (cache.isLoaded(options.imageIds[index])) {
            return Promise.resolve(true);
          }
          return new Promise((resolve, reject) => {
            const imageId = options.imageIds[index];
            imageLoadPoolManager.addRequest(
              async () => {
                loadImageDecimated(imageId)
                  .then(() => {
                    console.log(`Prefetched imageId: ${imageId}`);
                    resolve(true);
                  })
                  .catch((err) => {
                    reject(err);
                  });
              },
              RequestType.Prefetch,
              { volumeId },
              1 // priority
            );
          });
        })
      ).catch(console.error);
    }

    const volumeProps = generateVolumePropsFromImageIds(
      options.imageIds,
      volumeId
    );

    let {
      dimensions,
      spacing,
      origin,
      direction,
      metadata,
      imageIds,
      dataType,
      numberOfComponents,
    } = volumeProps;

    // Adjust in‑plane dimensions + spacing if we decimate rows/cols
    if (inPlaneDecimation > 1) {
      dimensions = [
        Math.ceil(dimensions[0] / inPlaneDecimation),
        Math.ceil(dimensions[1] / inPlaneDecimation),
        dimensions[2],
      ];
      spacing = [
        spacing[0] * inPlaneDecimation,
        spacing[1] * inPlaneDecimation,
        spacing[2],
      ];
    }

    const streamingImageVolume = new StreamingImageVolume(
      // ImageVolume properties
      {
        volumeId,
        metadata,
        dimensions,
        spacing,
        origin,
        direction,
        imageIds,
        dataType,
        numberOfComponents,
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
        customLoadInfo: {
          sliceDecimation,
          inPlaneDecimation,
        },
      }
    );

    //(streamingImageVolume as StreamingImageVolume)._loadImageFn = loadImageDecimated;
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

export default decimateVolumeLoader;
