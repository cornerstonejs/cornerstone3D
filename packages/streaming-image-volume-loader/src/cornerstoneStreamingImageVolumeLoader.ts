import {
  cache,
  utilities,
  Enums,
  imageLoader,
  imageLoadPoolManager,
  getShouldUseSharedArrayBuffer,
  getConfiguration,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';
import StreamingImageVolume from './StreamingImageVolume';

const {
  createUint8SharedArray,
  createFloat32SharedArray,
  createUint16SharedArray,
  createInt16SharedArray,
} = utilities;

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

  const { useNorm16Texture, preferSizeOverAccuracy } =
    getConfiguration().rendering;
  const use16BitDataType = useNorm16Texture || preferSizeOverAccuracy;

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

    const { imageIds, progressiveRendering } = options;

    const volumeMetadata = csUtils.makeVolumeMetadata(imageIds);

    // For a streaming volume, the data type cannot rely on cswil to load
    // the proper array buffer type. This is because the target buffer container
    // must be decided ahead of time.
    // TODO: move this logic into CSWIL to avoid logic duplication.
    // We check if scaling parameters are negative we choose Int16 instead of
    // Uint16 for cases where BitsAllocated is 16.
    const imageIdIndex = Math.floor(imageIds.length / 2);
    const imageId = imageIds[imageIdIndex];
    const scalingParameters = csUtils.getScalingParameters(imageId);
    const hasNegativeRescale =
      scalingParameters.rescaleIntercept < 0 ||
      scalingParameters.rescaleSlope < 0;

    // The prescale is ALWAYS used with modality LUT, so we can assume that
    // if the rescale slope is not an integer, we need to use Float32
    const hasFloatRescale =
      scalingParameters.rescaleIntercept % 1 !== 0 ||
      scalingParameters.rescaleSlope % 1 !== 0;

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

    const { zSpacing, origin, sortedImageIds } =
      csUtils.sortImageIdsAndGetSpacing(imageIds, scanAxisNormal);

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
    const numComponents = PhotometricInterpretation === 'RGB' ? 3 : 1;
    const useSharedArrayBuffer = getShouldUseSharedArrayBuffer();
    const length = dimensions[0] * dimensions[1] * dimensions[2];
    const handleCache = (sizeInBytes) => {
      if (!cache.isCacheable(sizeInBytes)) {
        throw new Error(Enums.Events.CACHE_SIZE_EXCEEDED);
      }
      cache.decacheIfNecessaryUntilBytesAvailable(sizeInBytes);
    };

    let scalarData, sizeInBytes;
    switch (BitsAllocated) {
      case 8:
        if (signed) {
          throw new Error(
            '8 Bit signed images are not yet supported by this plugin.'
          );
        }
        sizeInBytes = length * numComponents;
        handleCache(sizeInBytes);
        scalarData = useSharedArrayBuffer
          ? createUint8SharedArray(length * numComponents)
          : new Uint8Array(length * numComponents);
        break;

      case 16:
        // Temporary fix for 16 bit images to use Float32
        // until the new dicom image loader handler the conversion
        // correctly
        if (!use16BitDataType || hasFloatRescale) {
          sizeInBytes = length * 4;
          scalarData = useSharedArrayBuffer
            ? createFloat32SharedArray(length)
            : new Float32Array(length);

          break;
        }

        sizeInBytes = length * 2;
        if (signed || hasNegativeRescale) {
          handleCache(sizeInBytes);
          scalarData = useSharedArrayBuffer
            ? createInt16SharedArray(length)
            : new Int16Array(length);
          break;
        }

        if (!signed && !hasNegativeRescale) {
          handleCache(sizeInBytes);
          scalarData = useSharedArrayBuffer
            ? createUint16SharedArray(length)
            : new Uint16Array(length);
          break;
        }

        // Default to Float32 again
        sizeInBytes = length * 4;
        handleCache(sizeInBytes);
        scalarData = useSharedArrayBuffer
          ? createFloat32SharedArray(length)
          : new Float32Array(length);
        break;

      case 24:
        sizeInBytes = length * numComponents;
        handleCache(sizeInBytes);

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
