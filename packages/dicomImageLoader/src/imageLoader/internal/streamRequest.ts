import { Types, utilities } from '@cornerstonejs/core';
import { getOptions } from './options';
import { LoaderXhrRequestError } from '../../types';
import extractMultipart from '../wadors/extractMultipart';
import { getImageQualityStatus } from '../wadors/getImageQualityStatus';
import {
  CornerstoneWadoRsLoaderOptions,
  StreamingData,
} from '../wadors/loadImage';

const { ProgressiveIterator } = utilities;

/**
 * This function does a streaming parse from an http request, delivering
 * combined/subsequent parts of the result as iterations on a
 * ProgressiveIterator instance.
 *
 * @param url - to request and parse as either multipart or singlepart.
 * @param imageId
 * @param defaultHeaders
 * @returns
 */
export default function streamRequest(
  url: string,
  imageId: string,
  defaultHeaders: Record<string, string> = {},
  options: CornerstoneWadoRsLoaderOptions = {}
) {
  const globalOptions = getOptions();
  const {
    retrieveOptions = {} as Types.RangeRetrieveOptions,
    streamingData = {} as StreamingData,
  } = options;
  const minChunkSize = retrieveOptions.chunkSize || 128 * 1024;

  const errorInterceptor = (err: any) => {
    if (typeof globalOptions.errorInterceptor === 'function') {
      const error = new Error('request failed') as LoaderXhrRequestError;
      globalOptions.errorInterceptor(error);
    }
  };

  // Make the request for the streamable image frame (i.e. HTJ2K)
  const loadIterator = new ProgressiveIterator('streamRequest');
  loadIterator.generate(async (iterator, reject) => {
    const headers = Object.assign({}, defaultHeaders /* beforeSendHeaders */);

    Object.keys(headers).forEach(function (key) {
      if (headers[key] === null) {
        headers[key] = undefined;
      }
      if (key === 'Accept' && url.indexOf('accept=') !== -1) {
        headers[key] = undefined;
      }
    });

    try {
      const response = await fetch(url, {
        headers: defaultHeaders,
        signal: undefined,
      });

      // Response is expected to be a 200 status response
      if (response.status !== 200) {
        throw new Error(
          `Couldn't retrieve ${url} got status ${response.status}`
        );
      }
      const responseReader = response.body.getReader();
      const responseHeaders = response.headers;

      const contentType = responseHeaders.get('content-type');

      const totalBytes = Number(responseHeaders.get('Content-Length'));

      let readDone = false;
      let encodedData = streamingData.encodedData;
      // @ts-ignore
      let lastSize = streamingData.lastSize || 0;
      // @ts-ignore
      streamingData.isPartial = true;

      while (!readDone) {
        const { done, value } = await responseReader.read();
        encodedData = appendChunk(encodedData, value);
        if (!encodedData) {
          if (readDone) {
            throw new Error(`Done but no image frame available ${imageId}`);
          }
          continue;
        }
        readDone = done || encodedData.byteLength === totalBytes;
        if (!readDone && encodedData.length < lastSize + minChunkSize) {
          continue;
        }
        lastSize = encodedData.length;
        // @ts-ignore
        streamingData.isPartial = !done;
        const extracted = extractMultipart(
          contentType,
          encodedData,
          streamingData
        );
        const imageQualityStatus = getImageQualityStatus(
          retrieveOptions,
          readDone
        );
        const detail = {
          url,
          imageId,
          ...extracted,
          percentComplete: done
            ? 100
            : (extracted.pixelData?.length * 100) / totalBytes,
          imageQualityStatus,
          done: readDone,
        };

        // All of the image load events will be handled by the imageLoader
        // this simply delivers the raw data as it becomes available.
        iterator.add(detail, readDone);
      }
    } catch (err) {
      errorInterceptor(err);
      console.error(err);
      reject(err);
    }
  });

  return loadIterator.getNextPromise();
}

function appendChunk(existing: Uint8Array, chunk?: Uint8Array) {
  // that imageId
  if (!existing) {
    return chunk;
  }
  if (!chunk) {
    return existing;
  }
  const newDataArray = new Uint8Array(existing.length + chunk.length);
  newDataArray.set(existing, 0);
  newDataArray.set(chunk, existing.length);
  return newDataArray;
}
