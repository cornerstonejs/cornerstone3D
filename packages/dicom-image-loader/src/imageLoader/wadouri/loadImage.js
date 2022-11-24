import createImage from '../createImage.js';
import parseImageId from './parseImageId.js';
import dataSetCacheManager from './dataSetCacheManager.js';
import loadFileRequest from './loadFileRequest.js';
import getPixelData from './getPixelData.js';
import { xhrRequest } from '../internal/index.js';

// add a decache callback function to clear out our dataSetCacheManager
function addDecache(imageLoadObject, imageId) {
  imageLoadObject.decache = function () {
    // console.log('decache');
    const parsedImageId = parseImageId(imageId);

    dataSetCacheManager.unload(parsedImageId.url);
  };
}

function loadImageFromPromise(
  dataSetPromise,
  imageId,
  frame = 0,
  sharedCacheKey,
  options,
  callbacks
) {
  const start = new Date().getTime();
  const imageLoadObject = {
    cancelFn: undefined,
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
  imageId,
  frame = 0,
  sharedCacheKey,
  options
) {
  const start = new Date().getTime();

  const promise = new Promise((resolve, reject) => {
    const loadEnd = new Date().getTime();

    let imagePromise;

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
      image.data = dataSet;
      image.sharedCacheKey = sharedCacheKey;
      const end = new Date().getTime();

      image.loadTimeInMS = loadEnd - start;
      image.totalTimeInMS = end - start;
      resolve(image);
    }, reject);
  });

  return {
    promise,
    cancelFn: undefined,
  };
}

function getLoaderForScheme(scheme) {
  if (scheme === 'dicomweb' || scheme === 'wadouri') {
    return xhrRequest;
  } else if (scheme === 'dicomfile') {
    return loadFileRequest;
  }
}

function loadImage(imageId, options = {}) {
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
    const dataSet = dataSetCacheManager.get(parsedImageId.url, loader, imageId);

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
