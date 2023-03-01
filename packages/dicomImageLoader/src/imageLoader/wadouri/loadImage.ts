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
  let loader = options.loader;

  if (loader === undefined) {
    loader = getLoaderForScheme(parsedImageId.scheme);
  } else {
    delete options.loader;
  }

  // if the dataset for this url is already loaded, use it
  if (dataSetCacheManager.isLoaded(parsedImageId.url)) {
    /**
     * @todo The arguments to the dataSetCacheManager below are incorrect.
     */
    const dataSet: DataSet = (dataSetCacheManager as any).get(
      parsedImageId.url,
      loader,
      imageId
    );

    return loadImageFromDataSet(
      dataSet,
      imageId,
      parsedImageId.frame,
      parsedImageId.url,
      options
    );
  }

  // load the dataSet via the dataSetCacheManager
  const dataSetPromise = dataSetCacheManager.load(
    parsedImageId.url,
    loader,
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
