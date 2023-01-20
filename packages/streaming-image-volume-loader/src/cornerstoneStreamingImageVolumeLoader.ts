import {
  cache,
  utilities,
  Enums,
  imageLoader,
  imageLoadPoolManager,
  getShouldUseSharedArrayBuffer,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import { makeVolumeMetadata, sortImageIdsAndGetSpacing } from './helpers';
import StreamingImageVolume from './StreamingImageVolume';

const { createUint8SharedArray, createFloat32SharedArray } = utilities;

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

    const { imageIds } = options;

    const volumeMetadata = makeVolumeMetadata(imageIds);

    const {
      BitsAllocated,
      PixelRepresentation,
      PhotometricInterpretation,
      ImageOrientationPatient,
      PixelSpacing,
      Columns,
      Rows,
    } = volumeMetadata;

    const rowCosineVec = vec3.fromValues(
      ImageOrientationPatient[0],
      ImageOrientationPatient[1],
      ImageOrientationPatient[2]
    );
    const colCosineVec = vec3.fromValues(
      ImageOrientationPatient[3],
      ImageOrientationPatient[4],
      ImageOrientationPatient[5]
    );

    const scanAxisNormal = vec3.create();

    vec3.cross(scanAxisNormal, rowCosineVec, colCosineVec);

    const { zSpacing, origin, sortedImageIds } = sortImageIdsAndGetSpacing(
      imageIds,
      scanAxisNormal
    );

    const numFrames = imageIds.length;

    // Spacing goes [1] then [0], as [1] is column spacing (x) and [0] is row spacing (y)
    const spacing = <Types.Point3>[PixelSpacing[1], PixelSpacing[0], zSpacing];
    const dimensions = <Types.Point3>[Columns, Rows, numFrames];
    const direction = [
      ...rowCosineVec,
      ...colCosineVec,
      ...scanAxisNormal,
    ] as Types.Mat3;
    const signed = PixelRepresentation === 1;

    // Check if it fits in the cache before we allocate data
    // TODO Improve this when we have support for more types
    // NOTE: We use 4 bytes per voxel as we are using Float32.
    const bytesPerVoxel = BitsAllocated === 16 ? 4 : 1;
    const sizeInBytesPerComponent =
      bytesPerVoxel * dimensions[0] * dimensions[1] * dimensions[2];

    let numComponents = 1;
    if (PhotometricInterpretation === 'RGB') {
      numComponents = 3;
    }

    const sizeInBytes = sizeInBytesPerComponent * numComponents;

    // check if there is enough space in unallocated + image Cache
    const isCacheable = cache.isCacheable(sizeInBytes);
    if (!isCacheable) {
      throw new Error(Enums.Events.CACHE_SIZE_EXCEEDED);
    }

    cache.decacheIfNecessaryUntilBytesAvailable(sizeInBytes);

    const useSharedArrayBuffer = getShouldUseSharedArrayBuffer();
    const length = dimensions[0] * dimensions[1] * dimensions[2];

    let scalarData;
    switch (BitsAllocated) {
      case 8:
        if (signed) {
          throw new Error(
            '8 Bit signed images are not yet supported by this plugin.'
          );
        } else {
          scalarData = useSharedArrayBuffer
            ? createUint8SharedArray(length)
            : new Uint8Array(length);
        }

        break;

      case 16:
        scalarData = useSharedArrayBuffer
          ? createFloat32SharedArray(length)
          : new Float32Array(length);

        break;

      case 24:
        // hacky because we don't support alpha channel in dicom
        scalarData = useSharedArrayBuffer
          ? createUint8SharedArray(length * numComponents)
          : new Uint8Array(length * numComponents);

        break;
    }

    const streamingImageVolume = new StreamingImageVolume(
      // ImageVolume properties
      {
        volumeId,
        metadata: volumeMetadata,
        dimensions,
        spacing,
        origin,
        direction,
        scalarData,
        sizeInBytes,
      },
      // Streaming properties
      {
        imageIds: sortedImageIds,
        loadStatus: {
          // todo: loading and loaded should be on ImageVolume
          loaded: false,
          loading: false,
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
        streamingImageVolume.vtkOpenGLTexture.delete();
        streamingImageVolume.scalarData = null;
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
