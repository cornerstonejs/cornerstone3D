import {
  getEnabledElement,
  StackViewport,
  Enums,
  VideoViewport,
  WSIViewport,
} from '@cornerstonejs/core';
import { getToolState } from './state';

export const requestType = Enums.RequestType.Prefetch;
export const priority = 0;

export function range(lowEnd, highEnd) {
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

export function nearestIndex(arr, x) {
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

export function getStackData(element) {
  const enabledElement = getEnabledElement(element);

  if (!enabledElement) {
    // Can be not valid if the data is changed part way through prefetch
    return null;
  }

  const { viewport } = enabledElement;

  if (!(viewport instanceof StackViewport)) {
    // we shouldn't throw error here, since the viewport might have
    // changed from stack to volume during prefetch
    return null;
  }

  return {
    currentImageIdIndex: viewport.getCurrentImageIdIndex(),
    imageIds: viewport.getImageIds(),
  };
}

export function getPromiseRemovedHandler(element) {
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

export const clearFromImageIds = (stack) => {
  const imageIdSet = new Set<string>(stack.imageIds);
  return (requestDetails) =>
    requestDetails.type !== requestType ||
    !imageIdSet.has(requestDetails.additionalDetails.imageId);
};
