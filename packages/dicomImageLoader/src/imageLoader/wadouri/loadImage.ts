import type { ByteArray, DataSet } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import { Enums, metaData } from '@cornerstonejs/core';
import { Enums as MetadataEnums, utilities } from '@cornerstonejs/metadata';
import createImage from '../createImage';
import { xhrRequest } from '../internal/index';
import dataSetCacheManager from './dataSetCacheManager';
import type {
  LoadRequestFunction,
  DICOMLoaderIImage,
  DICOMLoaderImageOptions,
} from '../../types';
import getPixelData from './getPixelData';
import loadFileRequest from './loadFileRequest';
import parseImageId from './parseImageId';

const { ImageQualityStatus } = Enums;

const { addPart10Instance } = utilities;

// add a decache callback function to clear out our dataSetCacheManager
function addDecache(imageLoadObject: Types.IImageLoadObject, imageId: string) {
  imageLoadObject.decache = function () {
    // console.log('decache');
    const parsedImageId = parseImageId(imageId);

    dataSetCacheManager.unload(parsedImageId.url);
  };
}

/**
 * Given the dataSetPromise and imageId this will return a promise to be
 * resolved with an image object containing the loaded image.
 *
 * @param dataSetPromise - A promise that resolves to a DataSet object.
 * @param imageId - The imageId of the image to be loaded.
 * @param frame - The frame number to be loaded in case of multiframe. it should
 * be noted that this is used to extract the pixelData from dicomParser and
 * dicomParser is 0-based index (the first pixelData is frame 0); however,
 * in metadata and imageId frame is 1-based index (the first frame is frame 1).
 * @param sharedCacheKey -  A key to be used to cache the loaded image.
 * @param options - Options to be used when loading the image.
 * @param callbacks - Callbacks to be called when the image is loaded.
 * @returns An object containing a promise to be resolved with the loaded image
 */
function loadImageFromPromise(
  dataSetPromise: Promise<DataSet>,
  imageId: string,
  frame = 0,
  sharedCacheKey: string,
  options: DICOMLoaderImageOptions,
  callbacks?: {
    imageDoneCallback: (image: DICOMLoaderIImage) => void;
  }
): Types.IImageLoadObject {
  const start = new Date().getTime();
  const imageLoadObject: Types.IImageLoadObject = {
    cancelFn: undefined,
    promise: undefined,
  };

  imageLoadObject.promise = new Promise((resolve, reject) => {
    dataSetPromise.then(
      (dataSet /* , xhr*/) => {
        const pixelData = getPixelData(dataSet, frame);
        const transferSyntax = dataSet.string('x00020010');
        const loadEnd = new Date().getTime();
        const imagePromise = createImage(
          imageId,
          pixelData,
          transferSyntax,
          options
        );

        addDecache(imageLoadObject, imageId);

        imagePromise.then(
          (image) => {
            image = image as DICOMLoaderIImage;
            image.data = dataSet;
            const end = new Date().getTime();

            image.loadTimeInMS = loadEnd - start;
            image.totalTimeInMS = end - start;
            image.imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION;
            if (
              callbacks !== undefined &&
              callbacks.imageDoneCallback !== undefined
            ) {
              callbacks.imageDoneCallback(image);
            }
            resolve(image);
          },
          function (error) {
            // Reject the error, and the dataSet
            reject({
              error,
              dataSet,
            });
          }
        );
      },
      function (error) {
        // Reject the error
        reject({
          error,
        });
      }
    );
  });

  return imageLoadObject;
}

function loadImageFromDataSet(
  dataSet,
  imageId: string,
  frame = 0,
  _sharedCacheKey,
  options
): Types.IImageLoadObject {
  const start = new Date().getTime();

  const promise = new Promise<DICOMLoaderIImage | Types.IImageFrame>(
    (resolve, reject) => {
      const loadEnd = new Date().getTime();

      let imagePromise: Promise<DICOMLoaderIImage | Types.IImageFrame>;

      try {
        const pixelData = getPixelData(dataSet, frame);
        const transferSyntax = dataSet.string('x00020010');

        imagePromise = createImage(imageId, pixelData, transferSyntax, options);
      } catch (error) {
        // Reject the error, and the dataSet
        reject({
          error,
          dataSet,
        });

        return;
      }

      imagePromise.then((image) => {
        image = image as DICOMLoaderIImage;

        image.data = dataSet;
        // image.sharedCacheKey = sharedCacheKey;
        const end = new Date().getTime();

        image.loadTimeInMS = loadEnd - start;
        image.totalTimeInMS = end - start;
        image.imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION;
        resolve(image);
      }, reject);
    }
  );

  return {
    promise: promise as Promise<Types.IImage>,
    cancelFn: undefined,
  };
}

function getLoaderForScheme(scheme: string): LoadRequestFunction {
  if (scheme === 'dicomweb' || scheme === 'wadouri') {
    return xhrRequest as LoadRequestFunction;
  } else if (scheme === 'dicomfile') {
    return loadFileRequest as LoadRequestFunction;
  }
}

const asByteArray = (data) =>
  data instanceof ArrayBuffer ? new Uint8Array(data) : data;

function concatPixelData(pixelData) {
  // Single buffer case
  if (!Array.isArray(pixelData)) {
    return asByteArray(pixelData);
  }

  if (pixelData.length === 0) {
    return undefined;
  }

  if (pixelData.length === 1) {
    return asByteArray(pixelData[0]);
  }

  // Concatenate multiple frames
  let totalLength = 0;
  for (const frame of pixelData) {
    totalLength += asByteArray(frame).length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const frame of pixelData) {
    const view = asByteArray(frame);
    result.set(view, offset);
    offset += view.length;
  }
  return result;
}

/**
 * Loads an image from the NATURALIZED path: ensures NATURALIZED is populated (fetch +
 * addPart10Instance when needed), gets frame pixel data via getMetaData(MetadataModules.COMPRESSED_FRAME_DATA, imageId, `{ frameIndex }`),
 * then creates IImage. Does not use dataSetCacheManager.
 */
function loadImageFromNaturalizedMetadata(
  imageId: string,
  options: DICOMLoaderImageOptions = {}
): Types.IImageLoadObject {
  const parsedImageId = parseImageId(imageId);
  options = Object.assign({}, options);
  delete (options as Record<string, unknown>).loader;

  const schemeLoader = getLoaderForScheme(parsedImageId.scheme);
  const frameIndex =
    parsedImageId.pixelDataFrame !== undefined
      ? parsedImageId.pixelDataFrame
      : 0;

  const promise = (async (): Promise<DICOMLoaderIImage> => {
    const start = Date.now();
    console.log(
      '[dicomImageLoader/wadouri] loadImageFromNaturalizedMetadata: start',
      {
        imageId,
        scheme: parsedImageId.scheme,
        url: parsedImageId.url,
        frameIndex,
      }
    );

    const NATURAL = MetadataEnums.MetadataModules.NATURAL;
    const NATURALIZED =
      (MetadataEnums.MetadataModules as Record<string, string>).NATURALIZED ||
      NATURAL;
    const getNaturalizedMetadata = () =>
      metaData.get(NATURALIZED, imageId) ||
      (NATURALIZED !== NATURAL ? metaData.get(NATURAL, imageId) : undefined);

    let natural = getNaturalizedMetadata();
    if (!natural) {
      console.log(
        '[dicomImageLoader/wadouri] loadImageFromNaturalizedMetadata: no NATURALIZED metadata, attempting to fetch and populate',
        { imageId }
      );

      if (!schemeLoader) {
        throw new Error(
          `loadImageFromNaturalizedMetadata: no NATURALIZED cache and unknown scheme ${parsedImageId.scheme}`
        );
      }
      const result = (await schemeLoader(parsedImageId.url, imageId)) as
        | ArrayBuffer
        | { arrayBuffer: ArrayBuffer };
      const arrayBuffer =
        result instanceof ArrayBuffer ? result : result.arrayBuffer;
      // Store NATURALIZED under base imageId (no ?frame=) so registration happens once per URL
      const baseImageId = `${parsedImageId.scheme}:${parsedImageId.url}`;
      await addPart10Instance(baseImageId, arrayBuffer);
      natural = getNaturalizedMetadata();
    }

    const loadEnd = Date.now();

    const frameData = metaData.getTyped(
      MetadataEnums.MetadataModules.COMPRESSED_FRAME_DATA,
      imageId,
      { frameIndex }
    );
    if (!frameData) {
      console.warn(
        '[dicomImageLoader/wadouri] loadImageFromNaturalizedMetadata: no COMPRESSED_FRAME_DATA for imageId',
        { imageId, frameIndex }
      );

      throw new Error(
        `loadImageFromNaturalizedMetadata: no pixel data in NATURALIZED for imageId ${imageId}`
      );
    }

    const { pixelData, transferSyntaxUid } = frameData;

    const concatenatedPixelData = concatPixelData(pixelData);

    const image = await createImage(
      imageId,
      concatenatedPixelData,
      transferSyntaxUid,
      options
    );
    const end = Date.now();
    const out = image as DICOMLoaderIImage;
    out.imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION;
    out.data = natural;
    out.loadTimeInMS = loadEnd - start;
    out.totalTimeInMS = end - start;
    return out;
  })();

  return { promise };
}

/**
 * Legacy image loader entry point used when `useLegacyMetadataProvider` is true.
 * This conforms to `Types.ImageLoaderFn` (imageId, options) and internally
 * uses `dataSetCacheManager.load` plus `loadImageFromPromise`.
 *
 * @deprecated This loads images using the legacy URI loader, not the newer @cornerstonejs/metadata framework
 */
const loadImage = (
  imageId: string,
  options: DICOMLoaderImageOptions = {}
): Types.IImageLoadObject => {
  const parsedImageId = parseImageId(imageId);

  const schemeLoader = getLoaderForScheme(parsedImageId.scheme);
  if (!schemeLoader) {
    throw new Error(
      `wadouri loadImage: no loader for scheme '${parsedImageId.scheme}'`
    );
  }

  const frameIndex =
    parsedImageId.pixelDataFrame !== undefined
      ? parsedImageId.pixelDataFrame
      : 0;

  // For legacy wadouri, the shared cache key is the underlying URL without
  // any frame parameter; multiframe helpers handle per-frame metadata.
  const sharedCacheKey = parsedImageId.url;

  const dataSetPromise = dataSetCacheManager.load(
    parsedImageId.url,
    schemeLoader,
    imageId
  ) as Promise<DataSet>;

  return loadImageFromPromise(
    dataSetPromise,
    imageId,
    frameIndex,
    sharedCacheKey,
    options
  );
};

export {
  loadImageFromPromise,
  getLoaderForScheme,
  loadImage,
  loadImageFromNaturalizedMetadata,
  loadImageFromDataSet,
};
