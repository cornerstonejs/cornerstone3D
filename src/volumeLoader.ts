import { getImageLoadObject, putImageLoadObject } from './imageCache/imageCache.js';
import EVENTS, { events } from './enums/events.js';
import triggerEvent from './src/utilities/triggerEvent.js';

/**
 * This module deals with VolumeLoaders, loading images and caching images
 * @module VolumeLoader
 */


const volumeLoaders = {};

let unknownVolumeLoader;

/**
 * Load an image using a registered Cornerstone Image Loader.
 *
 * The image loader that is used will be
 * determined by the image loader scheme matching against the imageId.
 *
 * @param {String} imageId A Cornerstone Image Object's imageId
 * @param {Object} [options] Options to be passed to the Image Loader
 *
 * @returns {ImageLoadObject} An Object which can be used to act after an image is loaded or loading fails
 * @memberof VolumeLoader
 */
function loadImageFromVolumeLoader (imageId, options) {
  const colonIndex = imageId.indexOf(':');
  const scheme = imageId.substring(0, colonIndex);
  const loader = volumeLoaders[scheme];

  if (loader === undefined || loader === null) {
    if (unknownVolumeLoader !== undefined) {
      return unknownVolumeLoader(imageId);
    }

    throw new Error('loadImageFromVolumeLoader: no image loader for imageId');
  }

  const imageLoadObject = loader(imageId, options);

  // Broadcast a volume loaded event once the image is loaded
  imageLoadObject.promise.then(function (image) {
    triggerEvent(events, EVENTS.IMAGE_LOADED, { image });
  }, function (error) {
    const errorObject = {
      imageId,
      error
    };

    triggerEvent(events, EVENTS.IMAGE_LOAD_FAILED, errorObject);
  });

  return imageLoadObject;
}

/**
 * Loads a volume given an imageId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred.  The loaded image is not stored in the cache.
 *
 * @param {String} imageId A Cornerstone Image Object's imageId
 * @param {Object} [options] Options to be passed to the Image Loader
 *
 * @returns {ImageLoadObject} An Object which can be used to act after an image is loaded or loading fails
 * @memberof VolumeLoader
 */
export function loadImage (imageId, options) {
  if (imageId === undefined) {
    throw new Error('loadImage: parameter imageId must not be undefined');
  }

  const imageLoadObject = getImageLoadObject(imageId);

  if (imageLoadObject !== undefined) {
    return imageLoadObject.promise;
  }

  return loadImageFromVolumeLoader(imageId, options).promise;
}

//

/**
 * Loads an image given an imageId and optional priority and returns a promise which will resolve to
 * the loaded image object or fail if an error occurred. The image is stored in the cache.
 *
 * @param {String} imageId A Cornerstone Image Object's imageId
 * @param {Object} [options] Options to be passed to the Image Loader
 *
 * @returns {ImageLoadObject} Image Loader Object
 * @memberof VolumeLoader
 */
export function loadAndCacheImage (imageId, options) {
  if (imageId === undefined) {
    throw new Error('loadAndCacheImage: parameter imageId must not be undefined');
  }

  let imageLoadObject = getImageLoadObject(imageId);

  if (imageLoadObject !== undefined) {
    return imageLoadObject.promise;
  }

  imageLoadObject = loadImageFromVolumeLoader(imageId, options);

  putImageLoadObject(imageId, imageLoadObject);

  return imageLoadObject.promise;
}

/**
 * Registers an volumeLoader plugin with cornerstone for the specified scheme
 *
 * @param {String} scheme The scheme to use for this image loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param {Function} volumeLoader A Cornerstone Image Loader function
 * @returns {void}
 * @memberof VolumeLoader
 */
export function registerVolumeLoader (scheme, volumeLoader) {
  volumeLoaders[scheme] = volumeLoader;
}

/**
 * Registers a new unknownVolumeLoader and returns the previous one
 *
 * @param {Function} volumeLoader A Cornerstone Image Loader
 *
 * @returns {Function|Undefined} The previous Unknown Image Loader
 * @memberof VolumeLoader
 */
export function registerUnknownVolumeLoader (volumeLoader) {
  const oldVolumeLoader = unknownVolumeLoader;

  unknownVolumeLoader = volumeLoader;

  return oldVolumeLoader;
}
