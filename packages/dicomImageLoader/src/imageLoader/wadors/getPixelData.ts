import { utilities, Enums } from '@cornerstonejs/core';

import { xhrRequest } from '../internal/index';
// import rangeRequest from '../internal/rangeRequest';
import streamRequest from '../internal/streamRequest';
import rangeRequest from '../internal/rangeRequest';
import extractMultipart from './extractMultipart';
import { LossyConfiguration } from 'core/src/types';
import { getFrameStatus } from './getFrameStatus';

const { ProgressiveIterator } = utilities;
const { FrameStatus } = Enums;

function getPixelData(
  uri: string,
  imageId: string,
  mediaType = 'application/octet-stream',
  retrieveOptions: LossyConfiguration = {}
) {
  const headers = {
    Accept: mediaType,
  };

  // TODO - consider allowing a complete rewrite of the path
  let url = retrieveOptions?.urlArguments
    ? `${uri}${uri.indexOf('?') === -1 ? '?' : '&'}${
        retrieveOptions.urlArguments
      }`
    : uri;
  if (retrieveOptions?.framesPath) {
    url = url.replace('/frames/', retrieveOptions.framesPath);
  }

  if (retrieveOptions.initialBytes) {
    return rangeRequest(url, imageId, headers, retrieveOptions);
  }

  // Default to streaming the response data so that it can be decoding in
  // a streaming parser.
  if (retrieveOptions.streaming !== false) {
    return streamRequest(url, imageId, headers, retrieveOptions);
  }

  /**
   * Not progressively rendering, use regular xhr request.
   */
  const loadIterator = new ProgressiveIterator('xhrRequestImage');
  const loadPromise = xhrRequest(url, imageId, headers);
  const { xhr } = loadPromise;

  loadPromise.then(
    function (imageFrameAsArrayBuffer /* , xhr*/) {
      const contentType =
        xhr.getResponseHeader('Content-Type') || 'application/octet-stream';
      const extracted = extractMultipart(
        contentType,
        new Uint8Array(imageFrameAsArrayBuffer)
      );
      extracted.status = getFrameStatus(retrieveOptions, true);
      loadIterator.add(extracted, true);
    },
    (reason) => loadIterator.reject(reason)
  );
  return loadIterator.getNextPromise();
}

export default getPixelData;
