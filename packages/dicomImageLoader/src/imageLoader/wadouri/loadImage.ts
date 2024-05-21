import { DataSet } from 'dicom-parser';
import { Types } from '@cornerstonejs/core';
import createImage from '../createImage';
import { xhrRequest } from '../internal/index';
import dataSetCacheManager from './dataSetCacheManager';
import {
  LoadRequestFunction,
  DICOMLoaderIImage,
  DICOMLoaderImageOptions,
  ImageFrame,
} from '../../types';
import getPixelData from './getPixelData';
import loadFileRequest from './loadFileRequest';
import parseImageId from './parseImageId';

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
            image.sharedCacheKey = sharedCacheKey;
            const end = new Date().getTime();

            image.loadTimeInMS = loadEnd - start;
            image.totalTimeInMS = end - start;
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
  sharedCacheKey: string,
  options
): Types.IImageLoadObject {
  const start = new Date().getTime();

  const promise = new Promise<DICOMLoaderIImage | ImageFrame>(
    (resolve, reject) => {
      const loadEnd = new Date().getTime();

      let imagePromise: Promise<DICOMLoaderIImage | ImageFrame>;

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
        image.sharedCacheKey = sharedCacheKey;
        const end = new Date().getTime();

        image.loadTimeInMS = loadEnd - start;
        image.totalTimeInMS = end - start;
        resolve(image);
      }, reject);
    }
  );

  return {
    promise: promise as Promise<any>,
    cancelFn: undefined,
  };
}

function getLoaderForScheme(scheme: string): LoadRequestFunction {
  if (scheme === 'dicomweb' || scheme === 'wadouri') {
    return xhrRequest;
  } else if (scheme === 'dicomfile') {
    return loadFileRequest;
  }
}

function loadImage(
  imageId: string,
  options: DICOMLoaderImageOptions = {}
): Types.IImageLoadObject {
  const parsedImageId = parseImageId(imageId);

  options = Object.assign({}, options);

  // IMPORTANT: if you have a custom loader that you want to use for a specific
  // scheme, you should create your own loader and register it with the scheme
  // in the image loader, and NOT just pass it in as an option. This is because
  // the scheme is used to determine the loader to use and is more maintainable

  // The loader isn't transferable, so ensure it is deleted
  delete options.loader;
  // The options might have a loader above, but it is a loader into the cache,
  // so not the scheme loader, which is separate and defined by the scheme here
  const schemeLoader = getLoaderForScheme(parsedImageId.scheme);

  // if the dataset for this url is already loaded, use it, in case of multiframe
  // images, we need to extract the frame pixelData from the dataset although the
  // image is loaded
  if (dataSetCacheManager.isLoaded(parsedImageId.url)) {
    /**
     * @todo The arguments to the dataSetCacheManager below are incorrect.
     */
    const dataSet: DataSet = (dataSetCacheManager as any).get(
      parsedImageId.url,
      schemeLoader,
      imageId
    );

    return loadImageFromDataSet(
      dataSet,
      imageId,
      parsedImageId.pixelDataFrame,
      parsedImageId.url,
      options
    );
  }

  // load the dataSet via the dataSetCacheManager
  const dataSetPromise = dataSetCacheManager.load(
    parsedImageId.url,
    schemeLoader,
    imageId
  );

  return loadImageFromPromise(
    dataSetPromise,
    imageId,
    parsedImageId.frame,
    parsedImageId.url,
    options
  );
}

export { loadImageFromPromise, getLoaderForScheme, loadImage };
