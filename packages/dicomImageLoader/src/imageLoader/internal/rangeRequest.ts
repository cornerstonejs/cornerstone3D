import { Types, Enums } from '@cornerstonejs/core';
import { getOptions } from './options';
import { LoaderXhrRequestError, LoaderXhrRequestPromise } from '../../types';
import metaDataManager from '../wadors/metaDataManager';
import extractMultipart from '../wadors/extractMultipart';
import { getImageStatus } from '../wadors/getImageStatus';
import { CornerstoneWadoRsLoaderOptions } from '../wadors/loadImage';

type RetrieveOptions = Types.RetrieveOptions;

/**
 * Performs a range request to fetch part of an encoded image, typically
 * so that partial resolution images can be fetched.
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
  pixelData: Uint8Array;
  status: Enums.ImageStatus;
  percentComplete: number;
}> {
  const globalOptions = getOptions();
  const { retrieveOptions = {}, streamingData } = options;
  const initialBytes =
    streamingData.initialBytes ||
    getValue(imageId, retrieveOptions, 'initialBytes') ||
    65536;
  const totalRangesToFetch =
    getValue(imageId, retrieveOptions, 'totalRangesToFetch') || 2;

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
    status: Enums.ImageStatus;
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
        streamingData.initialBytes = initialBytes;
        streamingData.totalRanges = totalRangesToFetch;
        streamingData.rangesFetched = 0;
      }
      const byteRange = getByteRange(
        streamingData,
        retrieveOptions,
        initialBytes
      );

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
      resolve({
        ...extract,
        status: getImageStatus(
          retrieveOptions,
          doneAllBytes || retrieveOptions.isLossy === false
        ),
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
  headers: any,
  range: [number, number],
  streamingData
) {
  if (range) {
    headers = Object.assign(headers, {
      Range: `bytes=${range[0]}-${range[1]}`,
    });
  }
  const response = await fetch(url, {
    headers,
    signal: undefined,
  });

  const responseArrayBuffer = await response.arrayBuffer();
  const responseTypedArray = new Uint8Array(responseArrayBuffer);
  const { status } = response;

  // Append new data
  let { encodedData } = streamingData;
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

  const contentRange = response.headers.get('Content-Range');
  if (contentRange) {
    streamingData.totalBytes = Number(contentRange.split('/')[1]);
  } else if (status !== 206 || !range) {
    streamingData.totalBytes = encodedData?.byteLength;
  } else if (encodedData?.length < range[1]) {
    streamingData.totalBytes = encodedData.byteLength;
  } else {
    streamingData.totalBytes = Number.MAX_SAFE_INTEGER;
  }

  return {
    encodedData: newByteArray,
    responseHeaders: response.headers,
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

function getByteRange(
  streamingData,
  retrieveOptions: RetrieveOptions,
  initialBytes = 65536,
  totalRanges = 2
): [number, number] {
  const { totalBytes, encodedData } = streamingData;
  const { range = 0 } = retrieveOptions;
  if (range > 0 && (!totalBytes || !encodedData)) {
    return null;
  }
  if (range === 0) {
    return [0, initialBytes];
  }
  const endPoints = [initialBytes];
  for (let endRange = 1; endRange < totalRanges; endRange++) {
    if (endRange === totalRanges - 1) {
      endPoints.push(totalBytes);
    } else {
      const previous = endPoints[endPoints.length - 1];
      endPoints.push(Math.min(totalBytes, previous + initialBytes));
    }
  }
  return [encodedData.byteLength, endPoints[range]];
}
