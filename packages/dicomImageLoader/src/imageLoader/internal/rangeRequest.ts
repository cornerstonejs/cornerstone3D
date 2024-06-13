import { Types, Enums } from '@cornerstonejs/core';
import { getOptions } from './options';
import { LoaderXhrRequestError, LoaderXhrRequestPromise } from '../../types';
import metaDataManager from '../wadors/metaDataManager';
import extractMultipart from '../wadors/extractMultipart';
import { getImageQualityStatus } from '../wadors/getImageQualityStatus';
import { CornerstoneWadoRsLoaderOptions } from '../wadors/loadImage';

type RangeRetrieveOptions = Types.RangeRetrieveOptions;

/**
 * Performs a range request to fetch part of an encoded image, typically
 * so that partial resolution images can be fetched.
 * The configuration of exactly what is requested is based on the transfer
 * syntax provided.
 * Note this generates 1 response for each call, and those reponses may or may
 * not be combined with each other depending on the configuration applied.
 *
 * * HTJ2K Streaming TSUID -> Use actual range requests, and set it up for streaming
 *   image decoding of byte range requests
 * * JLS and Non-streaming HTJ2K -> Use a sub-resolution (or thumbnail) endpoint
 *   followed by normal endpoint
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
  pixelData: Uint8Array;
  imageQualityStatus: Enums.ImageQualityStatus;
  percentComplete: number;
}> {
  const globalOptions = getOptions();
  const { retrieveOptions = {} as RangeRetrieveOptions, streamingData } =
    options;
  const chunkSize =
    streamingData.chunkSize ||
    getValue(imageId, retrieveOptions, 'chunkSize') ||
    65536;

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
    pixelData: Uint8Array;
    percentComplete: number;
    imageQualityStatus: Enums.ImageQualityStatus;
  }>(async (resolve, reject) => {
    const headers = Object.assign(
      {},
      defaultHeaders
      /* beforeSendHeaders */
    );

    Object.keys(headers).forEach(function (key) {
      if (headers[key] === null || headers[key] === undefined) {
        delete headers[key];
      }
    });

    try {
      if (!streamingData.encodedData) {
        streamingData.chunkSize = chunkSize;
        streamingData.rangesFetched = 0;
      }
      const byteRange = getByteRange(streamingData, retrieveOptions);

      const { encodedData, responseHeaders } = await fetchRangeAndAppend(
        url,
        headers,
        byteRange,
        streamingData
      );

      // Resolve promise with the first range, so it can be passed through to
      // cornerstone via the usual image loading pathway. All subsequent
      // ranges will be passed and decoded via events.
      const contentType = responseHeaders.get('content-type');
      const { totalBytes } = streamingData;
      const doneAllBytes = totalBytes === encodedData.byteLength;
      const extract = extractMultipart(contentType, encodedData, {
        isPartial: true,
      });

      // Allow over-writing the done status to indicate complete on partial
      const imageQualityStatus = getImageQualityStatus(
        retrieveOptions,
        doneAllBytes || extract.extractDone
      );
      resolve({
        ...extract,
        imageQualityStatus,
        percentComplete: extract.extractDone
          ? 100
          : (chunkSize * 100) / totalBytes,
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
  headers: any,
  range: [number, number | ''],
  streamingData
) {
  if (range) {
    headers = Object.assign(headers, {
      Range: `bytes=${range[0]}-${range[1]}`,
    });
  }
  let { encodedData } = streamingData;
  if (range[1] && encodedData?.byteLength > range[1]) {
    return streamingData;
  }
  const response = await fetch(url, {
    headers,
    signal: undefined,
  });

  const responseArrayBuffer = await response.arrayBuffer();
  const responseTypedArray = new Uint8Array(responseArrayBuffer);
  const { status } = response;

  // Append new data
  let newByteArray: Uint8Array;
  if (encodedData) {
    newByteArray = new Uint8Array(
      encodedData.length + responseTypedArray.length
    );
    newByteArray.set(encodedData, 0);
    newByteArray.set(responseTypedArray, encodedData.length);
    streamingData.rangesFetched = 1;
  } else {
    newByteArray = new Uint8Array(responseTypedArray.length);
    newByteArray.set(responseTypedArray, 0);
    streamingData.rangesFetched++;
  }
  streamingData.encodedData = encodedData = newByteArray;
  streamingData.responseHeaders = response.headers;

  const contentRange = response.headers.get('Content-Range');
  if (contentRange) {
    streamingData.totalBytes = Number(contentRange.split('/')[1]);
  } else if (status !== 206 || !range) {
    streamingData.totalBytes = encodedData?.byteLength;
  } else if (range[1] === '' || encodedData?.length < range[1]) {
    streamingData.totalBytes = encodedData.byteLength;
  } else {
    streamingData.totalBytes = Number.MAX_SAFE_INTEGER;
  }

  return streamingData;
}

function getValue(imageId: string, src, attr: string) {
  const value = src[attr];
  if (typeof value !== 'function') {
    return value;
  }
  const metaData = metaDataManager.get(imageId);
  return value(metaData, imageId);
}

function getByteRange(
  streamingData,
  retrieveOptions: RangeRetrieveOptions
): [number, number | ''] {
  const { totalBytes, encodedData, chunkSize = 65536 } = streamingData;
  const { rangeIndex = 0 } = retrieveOptions;
  if (rangeIndex === -1 && (!totalBytes || !encodedData)) {
    return [0, ''];
  }
  if (rangeIndex === -1 || encodedData?.byteLength > totalBytes - chunkSize) {
    return [encodedData?.byteLength || 0, ''];
  }
  // Note the byte range is inclusive at both ends and zero based,
  // so the byteLength is the next index to fetch.
  return [encodedData?.byteLength || 0, chunkSize * (rangeIndex + 1) - 1];
}
