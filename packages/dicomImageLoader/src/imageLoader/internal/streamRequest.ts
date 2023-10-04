import { utilities } from '@cornerstonejs/core';
import external from '../../externalModules';
import { getOptions } from './options';
import { LoaderXhrRequestError } from '../../types';
import metaDataManager from '../wadors/metaDataManager';
import extractMultipart from '../wadors/extractMultipart';

const { ProgressiveIterator } = utilities;

const loadTracking: { [key: string]: { loaded: number; total: number } } = {};

const streamCache: {
  [key: string]: { byteArray: Uint8Array; currentChunkSize: number };
} = {};

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
  defaultHeaders: Record<string, string> = {}
) {
  const { cornerstone } = external;
  const options = getOptions();

  let minChunkSize = options.minChunkSize;
  if (typeof minChunkSize === 'function') {
    const metaData = metaDataManager.get(imageId);
    minChunkSize = minChunkSize(metaData, imageId);
  }
  if (!Number.isInteger(minChunkSize)) {
    throw new Error(
      `minChunkSize must be an integer or function that returns an integer.`
    );
  }

  const errorInterceptor = (err: any) => {
    if (typeof options.errorInterceptor === 'function') {
      const error = new Error('request failed') as LoaderXhrRequestError;
      options.errorInterceptor(error);
    }
  };

  console.time('Full Image');
  const start = Date.now();

  // Make the request for the streamable image frame (i.e. HTJ2K)
  const loadIterator = new ProgressiveIterator('streamRequest');
  loadIterator.process(async (iterator, reject) => {
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
      loadTracking[imageId] = { total: totalBytes, loaded: 0 };

      let readDone = false;
      let imageFrame;
      let extracted;
      while (!readDone) {
        const { done, value } = await responseReader.read();
        readDone = done;
        imageFrame = appendChunk({
          imageId,
          chunk: value,
          complete: readDone,
          minChunkSize: minChunkSize as number,
        });
        if (!imageFrame) {
          if (readDone) {
            throw new Error(`Done but no image frame available ${imageId}`);
          }
          continue;
        }

        extracted = extractMultipart(
          contentType,
          imageFrame,
          extracted,
          !readDone
        );
        const detail = {
          url,
          imageId,
          ...extracted,
          percentComplete: (extracted.pixelData?.length * 100) / totalBytes,
        };

        // When the first chunk of the downloaded image arrives, resolve the
        // request promise with that chunk, so it can be passed through to
        // cornerstone via the usual image loading pathway. All subsequent
        // chunks will be passed and decoded via events.
        iterator.add(detail, readDone);
      }
      loadTracking[imageId].loaded = imageFrame.length;
      console.log(
        'IMAGE_LOADED: ',
        Object.values(loadTracking).filter((v) => v.loaded === v.total).length,
        '/',
        Object.keys(loadTracking).length
      );
      cornerstone.triggerEvent(
        cornerstone.eventTarget,
        cornerstone.EVENTS.IMAGE_LOADED,
        { url, imageId }
      );
      console.timeEnd('Full Image');
    } catch (err) {
      errorInterceptor(err);
      console.error(err);
      reject(err);
    }
  });

  return loadIterator.getNextPromise();
}

function appendChunk(options: {
  imageId: string;
  minChunkSize: number;
  chunk?: Uint8Array;
  complete?: boolean;
}) {
  const { imageId, chunk, complete, minChunkSize } = options;

  // If we have a new chunk of data to append, append it to the Uint8Array for
  // that imageId
  if (!complete) {
    const existingDataForImageId = streamCache[imageId];
    if (!existingDataForImageId) {
      streamCache[imageId] = {
        byteArray: chunk,
        currentChunkSize: 0,
      };
    } else {
      const newDataArray = new Uint8Array(
        existingDataForImageId.byteArray.length + chunk.length
      );
      newDataArray.set(existingDataForImageId.byteArray, 0);
      newDataArray.set(chunk, existingDataForImageId.byteArray.length);
      streamCache[imageId].byteArray = newDataArray;
    }
  }

  const currentFrameByteArray = streamCache[imageId].byteArray;

  // If the file has been completely downloaded, just return the full byte array
  // from the cache.
  if (complete) {
    streamCache[imageId] = undefined;
    return currentFrameByteArray;
  }

  // Manually limit the minimum size of each "chunk" to be rendered, so that we
  // aren't calling the render pipeline a ton for tiny incremental changes.
  streamCache[imageId].currentChunkSize += chunk.length;

  if (streamCache[imageId].currentChunkSize >= minChunkSize) {
    streamCache[imageId].currentChunkSize = 0;
    return currentFrameByteArray;
  } else {
    return undefined;
  }
}
