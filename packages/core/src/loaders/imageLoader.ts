import cache from '../cache/cache';
import Events from '../enums/Events';
import eventTarget from '../eventTarget';
import { triggerEvent } from '../utilities';
import { IImage, ImageLoaderFn, IImageLoadObject, EventTypes } from '../types';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';

export interface ImageLoaderOptions {
  priority: number;
  requestType: string;
  additionalDetails?: Record<string, unknown>;
}
/**
 * This module deals with ImageLoaders, loading images and caching images
 */
const imageLoaders = {};
let unknownImageLoader;

/**
 * Loads an image using a registered Cornerstone Image Loader.
 *
 * The image loader that is used will be
 * determined by the image loader scheme matching against the imageId.
 *
 * @param imageId - A Cornerstone Image Object's imageId
 * @param Options - to be passed to the Image Loader
 *
 * @returns - An Object which can be used to act after an image is loaded or loading fails
 */
function loadImageFromImageLoader(
  imageId: string,
  options: ImageLoaderOptions
): IImageLoadObject {
  // Extract the image loader scheme: wadors:https://image1 => wadors
  const colonIndex = imageId.indexOf(':');
  const scheme = imageId.substring(0, colonIndex);
  const loader = imageLoaders[scheme];
  if (loader === undefined || loader === null) {
    if (unknownImageLoader !== undefined) {
      return unknownImageLoader(imageId);
    }
    throw new Error('loadImageFromImageLoader: no image loader for imageId');
  }
  // Load using the registered loader
  const imageLoadObject = loader(imageId, options);
  // Broadcast an image loaded event once the image is loaded
  imageLoadObject.promise.then(
    function (image) {
      triggerEvent(eventTarget, Events.IMAGE_LOADED, { image });
    },
    function (error) {
      const errorObject: EventTypes.ImageLoadedFailedEventDetail = {
        imageId,
        error,
      };
      triggerEvent(eventTarget, Events.IMAGE_LOAD_FAILED, errorObject);
    }
  );
  return imageLoadObject;
}

/**
 * Gets the imageLoadObject by 1) Looking in to the cache to see if the
 * imageLoadObject has already been cached, 2) Checks inside the volume cache
 * to see if there is a volume that contains the same imageURI for the requested
 * imageID 3) Checks inside the imageCache for similar imageURI that might have
 * been stored as a result of decaching a volume 4) Finally if none were found
 * it request it from the registered imageLoaders.
 *
 * @param imageId - A Cornerstone Image Object's imageId
 * @param options - Options to be passed to the Image Loader
 *
 * @returns An Object which can be used to act after an image is loaded or loading fails
 */
function loadImageFromCacheOrVolume(
  imageId: string,
  options: ImageLoaderOptions
): IImageLoadObject {
  // 1. Check inside the image cache for imageId
  let imageLoadObject = cache.getImageLoadObject(imageId);
  if (imageLoadObject !== undefined) {
    return imageLoadObject;
  }
  // 2. Check if there exists a volume in the cache containing the imageId,
  // we copy the pixelData over.
  const cachedVolumeInfo = cache.getVolumeContainingImageId(imageId);
  if (cachedVolumeInfo && cachedVolumeInfo.volume.loadStatus.loaded) {
    // 2.1 Convert the volume at the specific slice to a cornerstoneImage object.
    // this will copy the pixel data over.
    const { volume, imageIdIndex } = cachedVolumeInfo;
    imageLoadObject = volume.convertToCornerstoneImage(imageId, imageIdIndex);
    return imageLoadObject;
  }
  // 3. If no volume found, we search inside the imageCache for the imageId
  // that has the same URI which had been cached if the volume was converted
  // to an image
  const cachedImage = cache.getCachedImageBasedOnImageURI(imageId);
  if (cachedImage) {
    imageLoadObject = cachedImage.imageLoadObject;
    return imageLoadObject;
  }
  // 4. if not in image cache nor inside the volume cache, we request the
  // image loaders to load it
  imageLoadObject = loadImageFromImageLoader(imageId, options);

  return imageLoadObject;
}

/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The loaded image is not stored in the cache.
 *
 *
 * @param imageId - A Cornerstone Image Object's imageId
 * @param options - Options to be passed to the Image Loader
 *
 * @returns An Object which can be used to act after an image is loaded or loading fails
 */
export function loadImage(
  imageId: string,
  options: ImageLoaderOptions = { priority: 0, requestType: 'prefetch' }
): Promise<IImage> {
  if (imageId === undefined) {
    throw new Error('loadImage: parameter imageId must not be undefined');
  }

  return loadImageFromCacheOrVolume(imageId, options).promise;
}

/**
 * Loads an image given an imageId and optional priority and returns a promise
 * which will resolve to the loaded image object or fail if an error occurred.
 * The image is stored in the cache.
 *
 * @param imageId -  A Cornerstone Image Object's imageId
 * @param options - Options to be passed to the Image Loader
 *
 * @returns Image Loader Object
 */
export function loadAndCacheImage(
  imageId: string,
  options: ImageLoaderOptions = { priority: 0, requestType: 'prefetch' }
): Promise<IImage> {
  if (imageId === undefined) {
    throw new Error(
      'loadAndCacheImage: parameter imageId must not be undefined'
    );
  }
  const imageLoadObject = loadImageFromCacheOrVolume(imageId, options);

  // if not inside cache, store it
  if (!cache.getImageLoadObject(imageId)) {
    cache.putImageLoadObject(imageId, imageLoadObject).catch((err) => {
      console.warn(err);
    });
  }

  return imageLoadObject.promise;
}

/**
 * Load and cache a list of imageIds
 *
 * @param imageIds - list of imageIds
 * @param options - options for loader
 *
 */
export function loadAndCacheImages(
  imageIds: Array<string>,
  options: ImageLoaderOptions = { priority: 0, requestType: 'prefetch' }
): Promise<IImage>[] {
  if (!imageIds || imageIds.length === 0) {
    throw new Error(
      'loadAndCacheImages: parameter imageIds must be list of image Ids'
    );
  }

  const allPromises = imageIds.map((imageId) => {
    return loadAndCacheImage(imageId, options);
  });

  return allPromises;
}

/**
 * Removes the imageId from the request pool manager and executes the `cancel`
 * function if it exists.
 *
 * @param imageId - A Cornerstone Image Object's imageId
 *
 */
export function cancelLoadImage(imageId: string): void {
  const filterFunction = ({ additionalDetails }) => {
    if (additionalDetails.imageId) {
      return additionalDetails.imageId !== imageId;
    }

    // for volumes
    return true;
  };

  // Instruct the request pool manager to filter queued
  // requests to ensure requests we no longer need are
  // no longer sent.
  imageLoadPoolManager.filterRequests(filterFunction);

  // TODO: Cancel decoding and retrieval as well (somehow?)

  // cancel image loading if in progress
  const imageLoadObject = cache.getImageLoadObject(imageId);

  if (imageLoadObject) {
    imageLoadObject.cancelFn();
  }
}

/**
 * Removes the imageIds from the request pool manager and calls the `cancel`
 * function if it exists.
 *
 * @param imageIds - Array of Cornerstone Image Object's imageIds
 *
 */
export function cancelLoadImages(imageIds: Array<string>): void {
  imageIds.forEach((imageId) => cancelLoadImage(imageId));
}

/**
 * Removes all the ongoing image loads by calling the `cancel` method on each
 * imageLoadObject. If no `cancel` method is available, it will be ignored.
 *
 */
export function cancelLoadAll(): void {
  const requestPool = imageLoadPoolManager.getRequestPool();

  Object.keys(requestPool).forEach((type: string) => {
    const requests = requestPool[type];

    Object.keys(requests).forEach((priority) => {
      const requestDetails = requests[priority].pop();
      const { imageId, volumeId } = requestDetails.additionalDetails;

      let loadObject;

      if (imageId) {
        loadObject = cache.getImageLoadObject(imageId);
      } else if (volumeId) {
        loadObject = cache.getVolumeLoadObject(volumeId);
      }
      if (loadObject) {
        loadObject.cancel();
      }
    });
    // resetting the pool types to be empty
    imageLoadPoolManager.clearRequestStack(type);

    // TODO: Clear retrieval and decoding queues as well
  });
}

/**
 * Registers an imageLoader plugin with cornerstone for the specified scheme
 *
 * @param scheme - The scheme to use for this image loader (e.g. 'dicomweb', 'wadouri', 'http')
 * @param imageLoader - A Cornerstone Image Loader function
 */
export function registerImageLoader(
  scheme: string,
  imageLoader: ImageLoaderFn
): void {
  imageLoaders[scheme] = imageLoader;
}
/**
 * Registers a new unknownImageLoader and returns the previous one
 *
 * @param imageLoader - A Cornerstone Image Loader
 *
 * @returns The previous Unknown Image Loader
 */
export function registerUnknownImageLoader(
  imageLoader: ImageLoaderFn
): ImageLoaderFn {
  const oldImageLoader = unknownImageLoader;
  unknownImageLoader = imageLoader;
  return oldImageLoader;
}
/**
 * Removes all registered and unknown image loaders. This should be called
 * when the application is unmounted to prevent memory leaks.
 *
 */
export function unregisterAllImageLoaders(): void {
  Object.keys(imageLoaders).forEach(
    (imageLoader) => delete imageLoaders[imageLoader]
  );
  unknownImageLoader = undefined;
}
