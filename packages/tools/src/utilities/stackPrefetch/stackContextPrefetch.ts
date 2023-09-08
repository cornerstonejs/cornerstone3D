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
  // Fetch up to 1 image before and 50 after
  minBefore: 1,
  maxAfter: 5,
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

  function doneCallback(image) {
    const imageIdIndex = stack.imageIds.indexOf(image.imageId);

    removeFromList(imageIdIndex);
  }

  const requestFn = (imageId, options) =>
    imageLoader.loadAndCacheImage(imageId, options);

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

const updateToolState = (element) => {
  const stack = getStackData(element);
  if (!stack || !stack.imageIds || stack.imageIds.length === 0) {
    console.warn('CornerstoneTools.stackPrefetch: No images in stack.');
    return;
  }

  const { currentImageIdIndex } = stack;
  const { maxAfter = 5, minBefore = 1 } = configuration;
  const minIndex = Math.max(0, currentImageIdIndex - minBefore);

  const maxIndex = Math.min(
    stack.imageIds.length - 1,
    currentImageIdIndex + maxAfter
  );
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
  stackPrefetchData.indicesToRequest = range(minIndex, maxIndex);

  if (delta > 0 && delta < maxAfter) {
    // Cache extra images when navigating small amounts
    // The exact amount is hard to determine, but trial and error suggest
    // that fairly long precache lists work best.
    try {
      const lastMax =
        maxIndex + Math.max(stackPrefetchData.stackCount - maxAfter - 1, 0);
      if (stackPrefetchData.stackCount < 100) {
        stackPrefetchData.stackCount += maxAfter;
      }
      const maxExtraStack = Math.min(
        stack.imageIds.length - 1,
        currentImageIdIndex + stackPrefetchData.stackCount
      );
      for (let i = lastMax + 1; i < maxExtraStack; i++) {
        stackPrefetchData.indicesToRequest.push(i);
      }
    } catch (e) {
      console.warn('Caught', e);
    }
  } else {
    // Not incrementing by 1, so stop increasing the data size
    // TODO - consider reversing the CINE playback
    stackPrefetchData.stackCount = 0;
  }

  // Remove the currentImageIdIndex from the list to request
  const indexOfCurrentImage =
    stackPrefetchData.indicesToRequest.indexOf(currentImageIdIndex);
  stackPrefetchData.indicesToRequest.splice(indexOfCurrentImage, 1);

  addToolState(element, stackPrefetchData);
};

/**
 * Listen to newly added stacks enabled elements and then listen for
 * STACK_NEW_IMAGE to detect when a new image is displayed.  When it is,
 * update the prefetch stack for [index-min...index+max]
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
