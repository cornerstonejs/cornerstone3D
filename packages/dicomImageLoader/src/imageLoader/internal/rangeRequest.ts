import external from '../../externalModules';
import { getOptions } from './options';
import {
  LoaderXhrRequestError,
  LoaderXhrRequestParams,
  LoaderXhrRequestPromise,
} from '../../types';
import metaDataManager from '../wadors/metaDataManager';

const loadTracking: { [key: string]: { loaded: number; total: number } } = {};

const streamCache: {
  [key: string]: {
    byteArray?: Uint8Array;
    initialBytes: number;
    totalRanges: number;
    totalBytes?: number;
    rangesFetched: number;
  };
} = {};

function loadIsComplete(imageId) {
  return (
    streamCache[imageId].byteArray.length === streamCache[imageId].totalBytes
  );
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

export default function rangeRequest(
  url: string,
  imageId: string,
  defaultHeaders: Record<string, string> = {}
): LoaderXhrRequestPromise<{
  contentType: string;
  imageFrame: Uint8Array;
  complete: boolean;
  loadNextRange: () => any;
}> {
  const { cornerstone } = external;
  const options = getOptions();

  let initialBytes = options.initialBytes;
  if (typeof initialBytes === 'function') {
    const metaData = metaDataManager.get(imageId);
    initialBytes = initialBytes(metaData, imageId);
  }
  if (!Number.isInteger(initialBytes)) {
    throw new Error(
      `initialBytes must be an integer or function that returns an integer.`
    );
  }
  let totalRanges = options.totalRanges;
  if (typeof totalRanges === 'function') {
    const metaData = metaDataManager.get(imageId);
    totalRanges = totalRanges(metaData, imageId);
  }
  if (!Number.isInteger(totalRanges)) {
    throw new Error(
      `totalRanges must be an integer or function that returns an integer.`
    );
  }

  const errorInterceptor = (err: any) => {
    if (typeof options.errorInterceptor === 'function') {
      const error = new Error('request failed') as LoaderXhrRequestError;
      options.errorInterceptor(error);
    }
  };

  // Make the request for the streamable image frame (i.e. HTJ2K)
  const promise = new Promise<{
    contentType: string;
    imageFrame: Uint8Array;
    complete: boolean;
    loadNextRange: () => any;
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
      cornerstone.triggerEvent(
        cornerstone.eventTarget,
        'cornerstoneimageloadstart',
        {
          url,
          imageId,
        }
      );

      streamCache[imageId] = {
        initialBytes: initialBytes as number,
        totalRanges: totalRanges as number,
        rangesFetched: 0,
      };

      const { bytes, responseHeaders } = await fetchRangeAndAppend(
        url,
        imageId,
        headers,
        [0, initialBytes as number]
      );

      // Resolve promise with the first range, so it can be passed through to
      // cornerstone via the usual image loading pathway. All subsequent
      // ranges will be passed and decoded via events.
      const complete = loadIsComplete(imageId);
      const contentType = responseHeaders.get('content-type');
      resolve({
        complete,
        contentType,
        imageFrame: bytes,
        loadNextRange: complete
          ? undefined
          : async () => {
              const loadedBytes = streamCache[imageId].byteArray.length;
              const totalBytes = streamCache[imageId].totalBytes;
              if (loadIsComplete(imageId)) {
                return {
                  complete: true,
                  imageFrame: streamCache[imageId].byteArray,
                };
              }

              const rangesFetched = streamCache[imageId].rangesFetched;
              const rangeEnd =
                Math.ceil(
                  (totalBytes - loadedBytes) /
                    ((totalRanges as number) - rangesFetched)
                ) + loadedBytes;

              const { bytes } = await fetchRangeAndAppend(
                url,
                imageId,
                headers,
                [loadedBytes, rangeEnd]
              );

              return {
                complete: loadIsComplete(imageId),
                imageFrame: bytes,
                contentType,
              };
            },
      });
    } catch (err: any) {
      errorInterceptor(err);
      console.error(err);
      reject(err);
    }
  });

  return promise;
}
