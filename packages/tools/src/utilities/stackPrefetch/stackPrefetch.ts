import {
  getEnabledElement,
  StackViewport,
  imageLoader,
  Enums,
  eventTarget,
  imageLoadPoolManager,
  cache,
  getConfiguration as getCoreConfiguration,
} from '@cornerstonejs/core';
import { addToolState, getToolState } from './state';

const requestType = Enums.RequestType.Prefetch;
const priority = 0;
const addToBeginning = true;

let configuration = {
  maxImagesToPrefetch: Infinity,
  preserveExistingPool: false,
};

let resetPrefetchTimeout;
const resetPrefetchDelay = 10;

function range(lowEnd, highEnd) {
  // Javascript version of Python's range function
  // http://stackoverflow.com/questions/3895478/does-javascript-have-a-method-like-range-to-generate-an-array-based-on-suppl
  lowEnd = Math.round(lowEnd) || 0;
  highEnd = Math.round(highEnd) || 0;

  const arr = [];
  let c = highEnd - lowEnd + 1;

  if (c <= 0) {
    return arr;
  }

  while (c--) {
    arr[c] = highEnd--;
  }

  return arr;
}

function nearestIndex(arr, x) {
  // Return index of nearest values in array
  // http://stackoverflow.com/questions/25854212/return-index-of-nearest-values-in-an-array
  let low = 0;
  let high = arr.length - 1;

  arr.forEach((v, idx) => {
    if (v < x) {
      low = Math.max(idx, low);
    } else if (v > x) {
      high = Math.min(idx, high);
    }
  });

  return { low, high };
}

function getStackData(element) {
  const enabledElement = getEnabledElement(element);

  if (!enabledElement) {
    throw new Error(
      'stackPrefetch: element must be a valid Cornerstone enabled element'
    );
  }

  const { viewport } = enabledElement;

  if (!(viewport instanceof StackViewport)) {
    throw new Error(
      'stackPrefetch: element must be a StackViewport, VolumeViewport stackPrefetch not yet implemented'
    );
  }

  return {
    currentImageIdIndex: viewport.getCurrentImageIdIndex(),
    imageIds: viewport.getImageIds(),
  };
}

function prefetch(element) {
  // Get the stackPrefetch tool data
  const stackPrefetchData = getToolState(element);

  if (!stackPrefetchData) {
    return;
  }

  const stackPrefetch = stackPrefetchData || {};
  const stack = getStackData(element);

  if (!stack || !stack.imageIds || stack.imageIds.length === 0) {
    console.warn('CornerstoneTools.stackPrefetch: No images in stack.');
    return;
  }

  // If all the requests are complete, disable the stackPrefetch tool
  if (
    !stackPrefetch.indicesToRequest ||
    !stackPrefetch.indicesToRequest.length
  ) {
    stackPrefetch.enabled = false;
  }

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

    const imageLoadObject = cache.getImageLoadObject(imageId);

    if (imageLoadObject) {
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

    // triggerEvent(element, EVENTS.STACK_PREFETCH_IMAGE_LOADED, {
    //   element,
    //   imageId: image.imageId,
    //   imageIndex: imageIdIndex,
    //   stackPrefetch,
    //   stack,
    // });

    // If there are no more images to fetch
    // if (
    //   !(
    //     stackPrefetch.indicesToRequest &&
    //     stackPrefetch.indicesToRequest.length > 0
    //   )
    // ) {
    //   triggerEvent(element, EVENTS.STACK_PREFETCH_DONE, {
    //     element,
    //     stackPrefetch,
    //     stack,
    //   });
    // }
  }

  // Retrieve the errorLoadingHandler if one exists
  // const errorLoadingHandler =
  //   loadHandlerManager.getErrorLoadingHandler(element);

  // function failCallback(error) {
  //   logger.log('prefetch errored: %o', error);
  //   if (errorLoadingHandler) {
  //     errorLoadingHandler(element, imageId, error, 'stackPrefetch');
  //   }
  // }

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

  const { useNorm16Texture } = getCoreConfiguration().rendering;

  imageIdsToPrefetch.forEach((imageId) => {
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

function getPromiseRemovedHandler(element) {
  return function (e) {
    const eventData = e.detail;

    // When an imagePromise has been pushed out of the cache, re-add its index
    // It to the indicesToRequest list so that it will be retrieved later if the
    // CurrentImageIdIndex is changed to an image nearby
    let stackData;

    try {
      // It will throw an exception in some cases (eg: thumbnails)
      stackData = getStackData(element);
    } catch (error) {
      return;
    }

    if (!stackData || !stackData.imageIds || stackData.imageIds.length === 0) {
      return;
    }

    const stack = stackData;
    const imageIdIndex = stack.imageIds.indexOf(eventData.imageId);

    // Make sure the image that was removed is actually in this stack
    // Before adding it to the indicesToRequest array
    if (imageIdIndex < 0) {
      return;
    }

    const stackPrefetchData = getToolState(element);

    if (
      !stackPrefetchData ||
      !stackPrefetchData.data ||
      !stackPrefetchData.data.length
    ) {
      return;
    }

    stackPrefetchData.indicesToRequest.push(imageIdIndex);
  };
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

  if (stackPrefetchData && stackPrefetchData.data.length) {
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

export { enable, disable, getConfiguration, setConfiguration };
