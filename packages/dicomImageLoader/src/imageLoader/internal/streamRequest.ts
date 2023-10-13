import { utilities } from '@cornerstonejs/core';
import external from '../../externalModules';
import { getOptions } from './options';
import { LoaderXhrRequestError } from '../../types';
import metaDataManager from '../wadors/metaDataManager';
import extractMultipart from '../wadors/extractMultipart';
import { LossyConfiguration } from 'core/src/types';

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
  retrieveOptions: LossyConfiguration = {}
) {
  const { cornerstone } = external;
  const options = getOptions();

  // TODO - allow this to be configurable based on the retrieve type or
  // initial image data size
  const minChunkSize = 128 * 1024;

  const errorInterceptor = (err: any) => {
    if (typeof options.errorInterceptor === 'function') {
      const error = new Error('request failed') as LoaderXhrRequestError;
      options.errorInterceptor(error);
    }
  };

  const start = Date.now();

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
      const responseReader = response.body.getReader();
      const responseHeaders = response.headers;

      const contentType = responseHeaders.get('content-type');

      const totalBytes = Number(responseHeaders.get('Content-Length'));

      let readDone = false;
      let encodedData;
      let extracted;
      let lastSize = 0;
      while (!readDone) {
        const { done, value } = await responseReader.read();
        readDone = done;
        encodedData = appendChunk(encodedData, value);
        if (!encodedData) {
          if (readDone) {
            throw new Error(`Done but no image frame available ${imageId}`);
          }
          continue;
        }
        if (!readDone && encodedData.length < lastSize + minChunkSize) {
          continue;
        }
        lastSize = encodedData.length;

        extracted = extractMultipart(
          contentType,
          encodedData,
          extracted,
          !readDone
        );
        const detail = {
          url,
          imageId,
          ...extracted,
          percentComplete: (extracted.pixelData?.length * 100) / totalBytes,
          complete: !retrieveOptions?.isLossy && readDone,
          isLossy: !!retrieveOptions?.isLossy,
          done: readDone,
        };

        // When the first chunk of the downloaded image arrives, resolve the
        // request promise with that chunk, so it can be passed through to
        // cornerstone via the usual image loading pathway. All subsequent
        // chunks will be passed and decoded via events.
        iterator.add(detail, readDone);
      }
      cornerstone.triggerEvent(
        cornerstone.eventTarget,
        cornerstone.EVENTS.IMAGE_LOADED,
        { url, imageId }
      );
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
