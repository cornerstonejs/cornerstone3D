import type { Types, Enums } from '@cornerstonejs/core';
import { getOptions } from './options';
import type {
  LoaderXhrRequestError,
  LoaderXhrRequestPromise,
} from '../../types';
import metaDataManager from '../wadors/metaDataManager';
import extractMultipart from '../wadors/extractMultipart';
import { getImageQualityStatus } from '../wadors/getImageQualityStatus';
import type { CornerstoneWadoRsLoaderOptions } from '../wadors/loadImage';

type RangeRetrieveOptions = Types.RangeRetrieveOptions;

/**
 * Bytes fetched by the first range, when the stage sets no initialChunkSize.
 *
 * 32k is enough of an HTJ2K codestream to decode a recognisable full
 * resolution image, and OpenJPH decodes the truncated remainder rather than
 * throwing, so there is no reason to buy a larger buffer before showing
 * something.
 */
const DEFAULT_INITIAL_CHUNK_SIZE = 32768;

/**
 * Bytes fetched by each range after the first, when the stage sets no
 * chunkSize.
 *
 * Larger than the initial range because by this point the image is already on
 * screen and the job is refining it: fetching the remainder in 32k steps would
 * mean many more requests and decodes for the same result.
 */
const DEFAULT_CHUNK_SIZE = 131072;

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
    DEFAULT_CHUNK_SIZE;
  const initialChunkSize =
    streamingData.initialChunkSize ||
    getValue(imageId, retrieveOptions, 'initialChunkSize') ||
    DEFAULT_INITIAL_CHUNK_SIZE;

  const errorInterceptor = (err) => {
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
    // eslint-disable-next-line no-async-promise-executor
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
        streamingData.initialChunkSize = initialChunkSize;
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
        doneAllBytes || extract.extractDone === true
      );
      resolve({
        ...extract,
        imageQualityStatus,
        percentComplete: extract.extractDone
          ? 100
          : (encodedData.byteLength * 100) / totalBytes,
      });
    } catch (err) {
      errorInterceptor(err);
      console.error(err);
      reject(err);
    }
  });

  return promise;
}

async function fetchRangeAndAppend(
  url: string,
  headers: Record<string, string>,
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

/**
 * End offset, exclusive, of the range identified by rangeIndex.
 *
 * Range 0 covers the initial chunk and every range after it adds a full
 * chunkSize, so the boundaries are 32k, 160k, 288k ... on the defaults. The
 * two sizes differ because the first range is buying time to first image and
 * the rest are buying refinement.
 */
function rangeEndOffset(
  rangeIndex: number,
  initialChunkSize: number,
  chunkSize: number
) {
  return initialChunkSize + rangeIndex * chunkSize;
}

function getByteRange(
  streamingData,
  retrieveOptions: RangeRetrieveOptions
): [number, number | ''] {
  const {
    totalBytes,
    encodedData,
    chunkSize = DEFAULT_CHUNK_SIZE,
    initialChunkSize = DEFAULT_INITIAL_CHUNK_SIZE,
  } = streamingData;
  const { rangeIndex = 0 } = retrieveOptions;
  if (rangeIndex === -1 && (!totalBytes || !encodedData)) {
    return [0, ''];
  }
  if (rangeIndex === -1 || encodedData?.byteLength > totalBytes - chunkSize) {
    return [encodedData?.byteLength || 0, ''];
  }
  // Note the byte range is inclusive at both ends and zero based,
  // so the byteLength is the next index to fetch.
  return [
    encodedData?.byteLength || 0,
    rangeEndOffset(rangeIndex, initialChunkSize, chunkSize) - 1,
  ];
}
