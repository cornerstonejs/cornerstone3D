import { utilities } from '@cornerstonejs/core';

import { getOptions, xhrRequest } from '../internal/index';
// import rangeRequest from '../internal/rangeRequest';
import streamRequest from '../internal/streamRequest';
import imageIdToURI from '../imageIdToURI';
import extractMultipart from './extractMultipart';

const { ProgressiveIterator } = utilities;

function getPixelData(
  uri: string,
  imageId: string,
  mediaType = 'application/octet-stream',
  progressivelyRender = false
) {
  const headers = {
    Accept: mediaType,
  };

  const url = imageIdToURI(imageId);
  const searchParams = createURL(url).searchParams;
  // const fsiz = searchParams.get('fsiz');
  const streamMethod = getOptions().streamMethod;

  if (progressivelyRender && streamMethod === 'web-streams') {
    return streamRequest(uri, imageId, headers);
  }

  /**
   * Not progressively rendering, use regular xhr request.
   */
  console.log('getPixelData:Starting single load', imageId);
  const loadIterator = new ProgressiveIterator('xhrRequestImage');
  const loadPromise = xhrRequest(uri, imageId, headers);
  const { xhr } = loadPromise;

  loadPromise.then(
    function (imageFrameAsArrayBuffer /* , xhr*/) {
      const contentType =
        xhr.getResponseHeader('Content-Type') || 'application/octet-stream';
      // const decodeLevel = xhr.getResponseHeader('X-Decode-Level')
      //   ? Number(xhr.getResponseHeader('X-Decode-Level'))
      //   : undefined;

      console.log('getPixelData:Delivering complete data');
      loadIterator.add(
        extractMultipart(contentType, imageFrameAsArrayBuffer),
        true
      );
    },
    (reason) => loadIterator.reject(reason)
  );
  return loadIterator.getNextPromise();
}

function createURL(url) {
  if (url.substring(0, 4) !== 'http') {
    return new URL(`http://localhost/${url}`);
  }
  return new URL(url);
}
export default getPixelData;
