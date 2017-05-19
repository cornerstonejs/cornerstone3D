import $ from 'jquery';
import cornerstone from 'cornerstone-core';
import createImage from '../createImage';
import parseImageId from './parseImageId';
import dataSetCacheManager from './dataSetCacheManager';
import getEncapsulatedImageFrame from './getEncapsulatedImageFrame';
import getUncompressedImageFrame from './getUncompressedImageFrame';
import loadFileRequest from './loadFileRequest';
import { xhrRequest } from '../internal';

// add a decache callback function to clear out our dataSetCacheManager
function addDecache (image) {
  image.decache = function () {
    // console.log('decache');
    const parsedImageId = parseImageId(image.imageId);

    dataSetCacheManager.unload(parsedImageId.url);
  };
}

function getPixelData (dataSet, frameIndex) {
  const pixelDataElement = dataSet.elements.x7fe00010;

  if (pixelDataElement.encapsulatedPixelData) {
    return getEncapsulatedImageFrame(dataSet, frameIndex);
  }

  return getUncompressedImageFrame(dataSet, frameIndex);

}

function loadDataSetFromPromise (xhrRequestPromise, imageId, frame, sharedCacheKey, options) {

  const start = new Date().getTime();

  frame = frame || 0;
  const deferred = $.Deferred();

  xhrRequestPromise.then(function (dataSet/* , xhr*/) {
    const pixelData = getPixelData(dataSet, frame);
    const transferSyntax = dataSet.string('x00020010');
    const loadEnd = new Date().getTime();
    const imagePromise = createImage(imageId, pixelData, transferSyntax, options);

    imagePromise.then(function (image) {
      image.data = dataSet;
      const end = new Date().getTime();

      image.loadTimeInMS = loadEnd - start;
      image.totalTimeInMS = end - start;
      addDecache(image);
      deferred.resolve(image);
    });
  }, function (error) {
    deferred.reject(error);
  });

  return deferred;
}

function getLoaderForScheme (scheme) {
  if (scheme === 'dicomweb' || scheme === 'wadouri') {
    return xhrRequest;
  } else if (scheme === 'dicomfile') {
    return loadFileRequest;
  }
}

function loadImage (imageId, options) {
  const parsedImageId = parseImageId(imageId);
  const loader = getLoaderForScheme(parsedImageId.scheme);

  // if the dataset for this url is already loaded, use it
  if (dataSetCacheManager.isLoaded(parsedImageId.url)) {
    return loadDataSetFromPromise(dataSetCacheManager.load(parsedImageId.url, loader, imageId), imageId, parsedImageId.frame, parsedImageId.url, options);
  }

  // load the dataSet via the dataSetCacheManager
  return loadDataSetFromPromise(dataSetCacheManager.load(parsedImageId.url, loader, imageId), imageId, parsedImageId.frame, parsedImageId.url, options);
}

// register dicomweb and wadouri image loader prefixes
cornerstone.registerImageLoader('dicomweb', loadImage);
cornerstone.registerImageLoader('wadouri', loadImage);
cornerstone.registerImageLoader('dicomfile', loadImage);

export default loadImage;
