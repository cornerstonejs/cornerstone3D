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
  range,
  requestType,
  priority,
  clearFromImageIds,
  getPromiseRemovedHandler,
} from './stackPrefetchUtils';

let configuration = {
  maxImagesToPrefetch: Infinity,
  // Fetch up to 2 image before and after
  minBefore: 2,
  maxAfter: 2,
  // Increment the cache size by 10 images
  directionExtraImages: 10,
  preserveExistingPool: false,
};

let resetPrefetchTimeout;
// Starting the prefetch quickly isn't an issue as the main image is already being
// loaded, so a 5 ms prefetch delay is fine
const resetPrefetchDelay = 5;

function prefetch(element) {
  const stack = getStackData(element);
  if (!stack?.imageIds?.length) {
    console.warn('CornerstoneTools.stackPrefetch: No images in stack.');
    return;
  }

  // Get the stackPrefetch tool data
  const stackPrefetchData = getToolState(element);

  if (!stackPrefetchData) {
    return;
  }

  const stackPrefetch = stackPrefetchData || {};

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
  // IndicesToRequest array.
  const indicesToRequestCopy = stackPrefetch.indicesToRequest.slice();
  const { currentImageIdIndex } = stack;

  indicesToRequestCopy.forEach((imageIdIndex) => {
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
    imageLoadPoolManager.filterRequests(clearFromImageIds(stack));
  }

  function doneCallback(imageId) {
    const imageIdIndex = stack.imageIds.indexOf(imageId);

    removeFromList(imageIdIndex);

    if (!stackPrefetch.indicesToRequest.length) {
      const image = cache.getCachedImageBasedOnImageURI(imageId);
      if (image?.sizeInBytes) {
        const { sizeInBytes } = image;
        const usage = cache.getMaxCacheSize() / 4 / sizeInBytes;
        if (!stackPrefetch.cacheFill) {
          updateToolState(element, usage);
          prefetch(element);
        }
      }
    }
  }

  const requestFn = (imageId, options) =>
    imageLoader
      .loadAndCacheImage(imageId, options)
      .then(() => doneCallback(imageId));

  const { useNorm16Texture } = getCoreConfiguration().rendering;

  indicesToRequestCopy.forEach((imageIdIndex) => {
    const imageId = stack.imageIds[imageIdIndex];
    // IMPORTANT: Request type should be passed if not the 'interaction'
    // highest priority will be used for the request type in the imageRetrievalPool
    const options = {
      targetBuffer: {
        type: useNorm16Texture ? undefined : 'Float32Array',
      },
      preScale: {
        enabled: true,
      },
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
      updateToolState(element);
      prefetch(element);
    } catch (error) {
      return;
    }
  }, resetPrefetchDelay);
}

// Not a full signum, but good enough for direction.
const signum = (x) => (x < 0 ? -1 : 1);

const updateToolState = (element, usage?: number) => {
  const stack = getStackData(element);
  if (!stack || !stack.imageIds || stack.imageIds.length === 0) {
    console.warn('CornerstoneTools.stackPrefetch: No images in stack.');
    return;
  }

  const { currentImageIdIndex } = stack;
  let { maxAfter = 2, minBefore = 2 } = configuration;
  const { directionExtraImages = 10 } = configuration;
  // Use the currentImageIdIndex from the stack as the initialImageIdIndex
  const stackPrefetchData = getToolState(element) || {
    indicesToRequest: [],
    currentImageIdIndex,
    stackCount: 0,
    enabled: true,
    direction: 1,
  };
  const delta = currentImageIdIndex - stackPrefetchData.currentImageIdIndex;
  stackPrefetchData.direction = signum(delta);
  stackPrefetchData.currentImageIdIndex = currentImageIdIndex;
  stackPrefetchData.enabled = true;

  if (stackPrefetchData.stackCount < 100) {
    stackPrefetchData.stackCount += directionExtraImages;
  }

  if (Math.abs(delta) > maxAfter || !delta) {
    // Not incrementing by 1, so stop increasing the data size
    // TODO - consider reversing the CINE playback
    stackPrefetchData.stackCount = 0;
    if (usage) {
      // The usage of the cache that this stack can use
      const positionFraction = currentImageIdIndex / stack.imageIds.length;
      minBefore = Math.ceil(usage * positionFraction);
      maxAfter = Math.ceil(usage * (1 - positionFraction));
      stackPrefetchData.cacheFill = true;
    } else {
      stackPrefetchData.cacheFill = false;
    }
  } else if (delta < 0) {
    minBefore += stackPrefetchData.stackCount;
    maxAfter = 0;
  } else {
    maxAfter += stackPrefetchData.stackCount;
    minBefore = 0;
  }

  const minIndex = Math.max(0, currentImageIdIndex - minBefore);

  const maxIndex = Math.min(
    stack.imageIds.length - 1,
    currentImageIdIndex + maxAfter
  );

  // Order these correctly initially
  const indicesToRequest = [];
  for (let i = currentImageIdIndex + 1; i <= maxIndex; i++) {
    indicesToRequest.push(i);
  }
  for (let i = currentImageIdIndex - 1; i >= minIndex; i--) {
    indicesToRequest.push(i);
  }
  stackPrefetchData.indicesToRequest = indicesToRequest;

  addToolState(element, stackPrefetchData);
};

/**
 * Listen to newly added stacks enabled elements and then listen for
 * STACK_NEW_IMAGE to detect when a new image is displayed.  When it is,
 * update the prefetch stack.  This is done in a context sensitive manner,
 * where it is sensitive to the current position, the direction of travel,
 * and the total cache size.  The behaviour is:
 *
 * 1. On navigating to a new image initially, or one that is at a different position:
 *  * Fetch the next/previous 2 images
 * 2. If all the images in a given prefetch have compelted, then:
 *  * Fetch up to 1/4 of hte cache size images near the current image
 * 3. If the user is navigating forward/backward just a bit, then
 *  * Prefetch additional images in the direction of navigation
 *
 * This is designed to:
 *   * Get nearby images immediately so that they are available for navigation
 *   * Not interfere with loading other viewports if they are still loading
 *   * Load an entire series if it will fit in memory
 *   * Have images available for CINE/navigation in one direction
 *
 * @param element to prefetch on
 */
const enable = (element): void => {
  const stack = getStackData(element);

  if (!stack || !stack.imageIds || stack.imageIds.length === 0) {
    console.warn('CornerstoneTools.stackPrefetch: No images in stack.');
    return;
  }

  updateToolState(element);

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
};

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

  if (stackPrefetchData && stackPrefetchData.data.length) {
    stackPrefetchData.enabled = false;
    // Don't worry about clearing the requests - there aren't that many too be bothersome
  }
}

function getConfiguration() {
  return configuration;
}

function setConfiguration(config) {
  configuration = config;
}

const stackContextPrefetch = {
  enable,
  disable,
  getConfiguration,
  setConfiguration,
};

export default stackContextPrefetch;
