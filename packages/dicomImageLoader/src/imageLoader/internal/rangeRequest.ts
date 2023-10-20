import { Types, Enums } from '@cornerstonejs/core';
import external from '../../externalModules';
import { getOptions } from './options';
import { LoaderXhrRequestError, LoaderXhrRequestPromise } from '../../types';
import metaDataManager from '../wadors/metaDataManager';
import extractMultipart from '../wadors/extractMultipart';
import { getFrameStatus } from '../wadors/getFrameStatus';

/**
 * Performs a range or thumbnail request.
 * The configuration of exactly what is requested is based on the transfer
 * syntax provided.
 * Note this generates 1 response for each call, and those reponses may or may
 * not be combined with each other depending on the configuration applied.
 *
 * * HTJ2K Streaming TSUID -> Use actual range requests, and set it up for partial
 *   docding.
 * * JLS and Non-streaming HTJ2K -> Use a thumbnail endpoint followed by normal
 *   endpoint
 *
 * @param url - including an fsiz parameter
 * @param imageId - to fetch for
 * @param defaultHeaders  - to add to the request
 * @returns Compressed image data
 */
export default function rangeRequest(
  url: string,
  imageId: string,
  defaultHeaders: Record<string, string> = {},
  options: CornerstoneWadoRsLoaderOptions = {}
): LoaderXhrRequestPromise<{
  contentType: string;
  imageFrame: Uint8Array;
  status: Enums.FrameStatus;
}> {
  const globalOptions = getOptions();
  const { retrieveOptions = {}, streamingData = {} } = options;
  const initialBytes =
    getValue(imageId, retrieveOptions, 'initialBytes') || 65536;
  const totalRanges = getValue(imageId, retrieveOptions, 'totalRanges') || 2;

  const errorInterceptor = (err: any) => {
    if (typeof globalOptions.errorInterceptor === 'function') {
      const error = new Error('request failed') as LoaderXhrRequestError;
      globalOptions.errorInterceptor(error);
    } else {
      console.warn('rangeRequest:Caught', err);
    }
  };

  // Make the request for the streamable image frame (i.e. HTJ2K)
  const promise = new Promise<{
    contentType: string;
    imageFrame: Uint8Array;
    status: Enums.FrameStatus;
  }>(async (resolve, reject) => {
    const headers = Object.assign(
      {},
      defaultHeaders
      /* beforeSendHeaders */
    );

    Object.keys(headers).forEach(function (key) {
      if (headers[key] === null) {
        headers[key] = undefined;
      }
      if (key === 'Accept' && url.indexOf('accept=') !== -1) {
        headers[key] = undefined;
      }
    });

    try {
      if (!streamingData.encodedData) {
        streamingData.initialBytes = initialBytes;
        streamingData.totalRanges = totalRanges;
        streamingData.rangesFetched = 0;
      }
      const { rangesFetched } = streamingData;
      const byteRange: [number, number] = rangesFetched
        ? [initialBytes, streamingData.totalBytes]
        : [0, initialBytes];

      const { bytes, responseHeaders } = await fetchRangeAndAppend(
        url,
        imageId,
        headers,
        byteRange
      );

      // Resolve promise with the first range, so it can be passed through to
      // cornerstone via the usual image loading pathway. All subsequent
      // ranges will be passed and decoded via events.
      const contentType = responseHeaders.get('content-type');
      const totalBytes = Number(responseHeaders.get('content-length'));
      if (!streamingData.encodedData) {
        streamingData.encodedData = bytes;
        streamingData.totalBytes = totalBytes;
      } else {
        const newByteArray = new Uint8Array(
          streamingData.encodedData.length + bytes.length
        );
        newByteArray.set(streamingData.encodedData, 0);
        newByteArray.set(bytes, streamingData.encodedData.length);
        streamingData.encodedData = newByteArray;
      }
      const done = totalBytes === streamingData.encodedData.byteLength;
      streamingData.rangesFetched++;
      const extract = extractMultipart(contentType, bytes, { isPartial: true });

      resolve({
        ...extract,
        status: getFrameStatus(retrieveOptions, done),
        done,
        percentComplete: (initialBytes * 100) / totalBytes,
      });
    } catch (err: any) {
      errorInterceptor(err);
      console.error(err);
      reject(err);
    }
  });

  return promise;
}

async function fetchRangeAndAppend(
  url: string,
  imageId: string,
  headers: any,
  range: [number, number]
) {
  headers = Object.assign(headers, {
    Range: `bytes=${range[0]}-${range[1]}`,
  });
  const response = await fetch(url, {
    headers,
    signal: undefined,
  });

  const responseArrayBuffer = await response.arrayBuffer();
  const responseTypedArray = new Uint8Array(responseArrayBuffer);
  const responseHeaders = response.headers;

  // Append new data
  const existingBytesForImageId = streamCache[imageId].byteArray;
  let newByteArray: Uint8Array;
  if (existingBytesForImageId) {
    newByteArray = new Uint8Array(
      existingBytesForImageId.length + responseTypedArray.length
    );
    newByteArray.set(existingBytesForImageId, 0);
    newByteArray.set(responseTypedArray, existingBytesForImageId.length);
  } else {
    newByteArray = new Uint8Array(responseTypedArray.length);
    newByteArray.set(responseTypedArray, 0);
  }
  streamCache[imageId].byteArray = newByteArray;

  const contentRange = response.headers.get('Content-Range');
  if (contentRange) {
    streamCache[imageId].totalBytes = Number(
      responseHeaders.get('Content-Range').split('/')[1]
    );
  } else {
    streamCache[imageId].totalBytes = newByteArray.length;
  }

  loadTracking[imageId] = {
    total: Number(streamCache[imageId].totalBytes),
    loaded: newByteArray.length,
  };

  streamCache[imageId].rangesFetched += 1;

  return {
    bytes: newByteArray,
    responseHeaders,
  };
}

function getValue(imageId: string, src, attr: string) {
  const value = src[attr];
  if (typeof value !== 'function') {
    return value;
  }
  const metaData = metaDataManager.get(imageId);
  return value(metaData, imageId);
}
