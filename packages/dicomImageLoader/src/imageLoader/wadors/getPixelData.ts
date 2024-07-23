import type { Types } from '@cornerstonejs/core';
import { xhrRequest } from '../internal/index';
// import rangeRequest from '../internal/rangeRequest';
import streamRequest from '../internal/streamRequest';
import rangeRequest from '../internal/rangeRequest';
import extractMultipart from './extractMultipart';
import { getImageQualityStatus } from './getImageQualityStatus';
import { CornerstoneWadoRsLoaderOptions } from './loadImage';

function getPixelData(
  uri: string,
  imageId: string,
  mediaType = 'application/octet-stream',
  options?: CornerstoneWadoRsLoaderOptions
) {
  const { streamingData, retrieveOptions = {} as Types.RetrieveOptions } =
    options || {};
  const headers = {
    Accept: mediaType,
  };

  // Add urlArguments to the url for retrieving - allows accept and other
  // parameters to be added.
  let url = retrieveOptions.urlArguments
    ? `${uri}${uri.indexOf('?') === -1 ? '?' : '&'}${
        retrieveOptions.urlArguments
      }`
    : uri;

  // Replace the /frames/ part of the path with another path to choose
  // a different resource type.
  if (retrieveOptions.framesPath) {
    url = url.replace('/frames/', retrieveOptions.framesPath);
  }

  // Swap the streaming data out if a new instance starts.
  if (streamingData?.url !== url) {
    options.streamingData = { url };
  }

  if (
    (retrieveOptions as Types.RangeRetrieveOptions).rangeIndex !== undefined
  ) {
    return rangeRequest(url, imageId, headers, options);
  }

  // Use the streaming parser only when configured to do so
  if ((retrieveOptions as Types.StreamingRetrieveOptions).streaming) {
    return streamRequest(url, imageId, headers, options);
  }

  /**
   * Not progressively rendering, use regular xhr request.
   */
  const loadPromise = xhrRequest(url, imageId, headers);
  const { xhr } = loadPromise;

  return loadPromise.then(function (imageFrameAsArrayBuffer /* , xhr*/) {
    const contentType =
      xhr.getResponseHeader('Content-Type') || 'application/octet-stream';
    const extracted = extractMultipart(
      contentType,
      new Uint8Array(imageFrameAsArrayBuffer)
    );
    extracted.imageQualityStatus = getImageQualityStatus(retrieveOptions, true);
    return extracted;
  });
}

export default getPixelData;
