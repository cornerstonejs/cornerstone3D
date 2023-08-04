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

let configuration = {
  maxImagesToPrefetch: Infinity,
  // Fetch up to 1 image before and 5 after
  minBefore: 1,
  maxAfter: 5,
  preserveExistingPool: false,
};

let resetPrefetchTimeout;
// Starting the prefetch quickly isn't an issue as the main image is already being
// loaded, so a 5 ms prefetch delay is fine
const resetPrefetchDelay = 5;

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

const clearFromImageIds = (stack) => {
  const { imageIds } = stack;
  const imageIdSet = new Set<string>();
  imageIds.forEach((imageId) => imageIdSet.add(imageId));
  return (requestDetails) =>
    requestDetails.type !== requestType ||
    !imageIdSet.has(requestDetails.additionalDetails.imageId);
};

function prefetch(element) {
  const stack = getStackData(element);
  if (!stack || !stack.imageIds || stack.imageIds.length === 0) {
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

  indicesToRequestCopy.forEach((imageIdIndex) => {
    const imageId = stack.imageIds[imageIdIndex];

    if (!imageId) {
      return;
    }

    const imageLoadObject = cache.getImageLoadObject(imageId);

    if (imageLoadObject) {
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
      updateToolState(element);
      prefetch(element);
    } catch (error) {
      return;
    }
  }, resetPrefetchDelay);
}

const updateToolState = (element) => {
  const stack = getStackData(element);
  if (!stack || !stack.imageIds || stack.imageIds.length === 0) {
    console.warn('CornerstoneTools.stackPrefetch: No images in stack.');
    return;
  }

  const minIndex = Math.max(
    0,
    stack.currentImageIdIndex - configuration.minBefore
  );
  const maxIndex = Math.min(
    stack.imageIds.length - 1,
    stack.currentImageIdIndex + configuration.maxAfter
  );
  // Use the currentImageIdIndex from the stack as the initialImageIdIndex
  const stackPrefetchData = {
    indicesToRequest: range(minIndex, maxIndex),
    enabled: true,
    direction: 1,
  };

  // Remove the currentImageIdIndex from the list to request
  const indexOfCurrentImage = stackPrefetchData.indicesToRequest.indexOf(
    stack.currentImageIdIndex
  );
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

export { enable, disable, getConfiguration, setConfiguration };
