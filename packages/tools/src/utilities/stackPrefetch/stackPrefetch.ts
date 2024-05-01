import {
  imageLoader,
  Enums,
  eventTarget,
  imageLoadPoolManager,
  cache,
  getConfiguration as getCoreConfiguration,
} from '@cornerstonejs/core';
import { addToolState, getToolState } from './state';
import {
  getStackData,
  requestType,
  priority,
  getPromiseRemovedHandler,
  nearestIndex,
  range,
} from './stackPrefetchUtils';

let configuration = {
  maxImagesToPrefetch: Infinity,
  // Preserving the existing pool should be the default behaviour, as there might
  // be a volume of the same series already being loaded in the pool, and we don't want
  // to cancel it middle of the way when the other stack viewport mounts. Worst case scenario
  // there will be a few extra images in the pool but by the time that their turn comes
  // we will have already loaded the volume and it will get read from the CACHE,
  // so who cares
  preserveExistingPool: true,
};

let resetPrefetchTimeout;
const resetPrefetchDelay = 10;

function prefetch(element) {
  // Get the stackPrefetch tool data
  const stackPrefetchData = getToolState(element);

  if (!stackPrefetchData) {
    return;
  }

  const stackPrefetch = stackPrefetchData || {};
  const stack = getStackData(element);

  if (!stack?.imageIds?.length) {
    console.warn('CornerstoneTools.stackPrefetch: No images in stack.');
    return;
  }

  const { currentImageIdIndex } = stack;

  // If all the requests are complete, disable the stackPrefetch tool
  stackPrefetch.enabled &&= stackPrefetch.indicesToRequest?.length;

  // Make sure the tool is still enabled
  if (stackPrefetch.enabled === false) {
    return;
  }

  // Remove an imageIdIndex from the list of indices to request
  // This fires when the individual image loading deferred is resolved
  function removeFromList(imageIdIndex) {
    const index = stackPrefetch.indicesToRequest.indexOf(imageIdIndex);

    if (index > -1) {
      // Don't remove last element if imageIdIndex not found
      stackPrefetch.indicesToRequest.splice(index, 1);
    }
  }

  // Remove all already cached images from the
  // IndicesToRequest array
  stackPrefetchData.indicesToRequest.sort((a, b) => a - b);
  const indicesToRequestCopy = stackPrefetch.indicesToRequest.slice();

  indicesToRequestCopy.forEach(function (imageIdIndex) {
    const imageId = stack.imageIds[imageIdIndex];

    if (!imageId) {
      return;
    }

    const distance = Math.abs(currentImageIdIndex - imageIdIndex);
    // For nearby objects, ensure the last accessed time is updated
    // by using getImageLoadObject.
    // For more distant objects, just check if available, but dont
    // change the access time.
    // This allows throwing data that hasn't been accessed and is not
    // nearby.
    const imageCached =
      distance < 6
        ? cache.getImageLoadObject(imageId)
        : cache.isLoaded(imageId);

    if (imageCached) {
      // Already in cache
      removeFromList(imageIdIndex);
    }
  });

  // Stop here if there are no images left to request
  // After those in the cache have been removed
  if (!stackPrefetch.indicesToRequest.length) {
    return;
  }

  // Clear the requestPool of prefetch requests, if needed.
  if (!configuration.preserveExistingPool) {
    imageLoadPoolManager.clearRequestStack(requestType);
  }

  // Identify the nearest imageIdIndex to the currentImageIdIndex
  const nearest = nearestIndex(
    stackPrefetch.indicesToRequest,
    stack.currentImageIdIndex
  );

  let imageId;
  let nextImageIdIndex;
  const preventCache = false;

  function doneCallback(image) {
    console.log('prefetch done: %s', image.imageId);
    const imageIdIndex = stack.imageIds.indexOf(image.imageId);

    removeFromList(imageIdIndex);
  }

  // Prefetch images around the current image (before and after)
  let lowerIndex = nearest.low;
  let higherIndex = nearest.high;
  const imageIdsToPrefetch = [];

  while (
    lowerIndex >= 0 ||
    higherIndex < stackPrefetch.indicesToRequest.length
  ) {
    const currentIndex = stack.currentImageIdIndex;
    const shouldSkipLower =
      currentIndex - stackPrefetch.indicesToRequest[lowerIndex] >
      configuration.maxImagesToPrefetch;
    const shouldSkipHigher =
      stackPrefetch.indicesToRequest[higherIndex] - currentIndex >
      configuration.maxImagesToPrefetch;

    const shouldLoadLower = !shouldSkipLower && lowerIndex >= 0;
    const shouldLoadHigher =
      !shouldSkipHigher && higherIndex < stackPrefetch.indicesToRequest.length;

    if (!shouldLoadHigher && !shouldLoadLower) {
      break;
    }

    if (shouldLoadLower) {
      nextImageIdIndex = stackPrefetch.indicesToRequest[lowerIndex--];
      imageId = stack.imageIds[nextImageIdIndex];
      imageIdsToPrefetch.push(imageId);
    }

    if (shouldLoadHigher) {
      nextImageIdIndex = stackPrefetch.indicesToRequest[higherIndex++];
      imageId = stack.imageIds[nextImageIdIndex];
      imageIdsToPrefetch.push(imageId);
    }
  }

  const requestFn = (imageId, options) =>
    imageLoader.loadAndCacheImage(imageId, options);

  const { useNorm16Texture, preferSizeOverAccuracy } =
    getCoreConfiguration().rendering;

  const useNativeDataType = useNorm16Texture || preferSizeOverAccuracy;

  imageIdsToPrefetch.forEach((imageId) => {
    // IMPORTANT: Request type should be passed if not the 'interaction'
    // highest priority will be used for the request type in the imageRetrievalPool
    const options = {
      targetBuffer: {
        type: useNativeDataType ? undefined : 'Float32Array',
      },
      preScale: {
        enabled: true,
      },
      useNativeDataType,
      requestType,
    };

    imageLoadPoolManager.addRequest(
      requestFn.bind(null, imageId, options),
      requestType,
      // Additional details
      {
        imageId,
      },
      priority
      // addToBeginning
    );
  });
}

function onImageUpdated(e) {
  // Start prefetching again (after a delay)
  // When the user has scrolled to a new image
  clearTimeout(resetPrefetchTimeout);
  resetPrefetchTimeout = setTimeout(function () {
    const element = e.target;

    // If playClip is enabled and the user loads a different series in the viewport
    // An exception will be thrown because the element will not be enabled anymore
    try {
      prefetch(element);
    } catch (error) {
      return;
    }
  }, resetPrefetchDelay);
}

function enable(element) {
  const stack = getStackData(element);

  if (!stack || !stack.imageIds || stack.imageIds.length === 0) {
    console.warn('CornerstoneTools.stackPrefetch: No images in stack.');
    return;
  }

  // Use the currentImageIdIndex from the stack as the initialImageIdIndex
  const stackPrefetchData = {
    indicesToRequest: range(0, stack.imageIds.length - 1),
    enabled: true,
    direction: 1,
  };

  // Remove the currentImageIdIndex from the list to request
  const indexOfCurrentImage = stackPrefetchData.indicesToRequest.indexOf(
    stack.currentImageIdIndex
  );

  stackPrefetchData.indicesToRequest.splice(indexOfCurrentImage, 1);

  addToolState(element, stackPrefetchData);

  prefetch(element);

  element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, onImageUpdated);
  element.addEventListener(Enums.Events.STACK_NEW_IMAGE, onImageUpdated);

  const promiseRemovedHandler = getPromiseRemovedHandler(element);

  eventTarget.removeEventListener(
    Enums.Events.IMAGE_CACHE_IMAGE_REMOVED,
    promiseRemovedHandler
  );
  eventTarget.addEventListener(
    Enums.Events.IMAGE_CACHE_IMAGE_REMOVED,
    promiseRemovedHandler
  );
}

function disable(element) {
  clearTimeout(resetPrefetchTimeout);
  element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, onImageUpdated);

  const promiseRemovedHandler = getPromiseRemovedHandler(element);

  eventTarget.removeEventListener(
    Enums.Events.IMAGE_CACHE_IMAGE_REMOVED,
    promiseRemovedHandler
  );

  const stackPrefetchData = getToolState(element);
  // If there is actually something to disable, disable it

  if (stackPrefetchData && stackPrefetchData.indicesToRequest.length) {
    stackPrefetchData.enabled = false;

    // Clear current prefetch requests from the requestPool
    imageLoadPoolManager.clearRequestStack(requestType);
  }
}

function getConfiguration() {
  return configuration;
}

function setConfiguration(config) {
  configuration = config;
}

const stackPrefetch = { enable, disable, getConfiguration, setConfiguration };

export default stackPrefetch;
