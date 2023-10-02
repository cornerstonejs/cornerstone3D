import external from '../../externalModules';
import { getOptions } from './options';
import {
  LoaderXhrRequestError,
  LoaderXhrRequestParams,
  LoaderXhrRequestPromise,
} from '../../types';
import metaDataManager from '../wadors/metaDataManager';
import extractMultipart from '../wadors/extractMultipart';

const loadTracking: { [key: string]: { loaded: number; total: number } } = {};

const streamCache: {
  [key: string]: { byteArray: Uint8Array; currentChunkSize: number };
} = {};

export default function streamRequest(
  url: string,
  imageId: string,
  defaultHeaders: Record<string, string> = {}
): LoaderXhrRequestPromise<{
  contentType: string;
  imageFrame: { pixelData: Uint8Array };
}> {
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
  const promise = new Promise<{
    contentType: string;
    imageFrame: Uint8Array;
    complete: boolean;
  }>(async (resolve, reject) => {
    let hasResolved = false;

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
      cornerstone.triggerEvent(
        cornerstone.eventTarget,
        'cornerstoneimageloadstart',
        {
          url,
          imageId,
        }
      );

      const response = await fetch(url, {
        headers: defaultHeaders,
        signal: undefined,
      });
      // const streamQueueingStrategy = new ByteLengthQueuingStrategy({
      //   highWaterMark: 65536,
      // });
      // const responseStream = new ReadableStream(
      //   response.body,
      //   streamQueueingStrategy
      // );
      const responseReader = response.body.getReader();
      const responseHeaders = response.headers;

      const contentType = responseHeaders.get('content-type');

      const totalBytes = responseHeaders.get('Content-Length');
      console.log('totalBytes=', totalBytes);
      loadTracking[imageId] = { total: Number(totalBytes), loaded: 0 };

      // for await (const chunk of response.body as unknown as Iterable<
      //   ReadableStream<Uint8Array>
      // >) {

      // }
      while (true) {
        const { done: complete, value } = await responseReader.read();
        const imageFrame = appendChunk({
          imageId,
          chunk: value,
          complete: complete,
          minChunkSize: minChunkSize as number,
        });
        if (!imageFrame) {
          if (complete) {
            throw new Error(`Done but no image frame available ${imageId}`);
          }
          continue;
        }

        const extracted = extractMultipart(contentType, imageFrame, !complete);
        const detail = {
          url,
          imageId,
          ...extracted,
        };

        if (complete) {
          console.timeEnd('Full Image');
        }
        // When the first chunk of the downloaded image arrives, resolve the
        // request promise with that chunk, so it can be passed through to
        // cornerstone via the usual image loading pathway. All subsequent
        // chunks will be passed and decoded via events.
        if (!hasResolved) {
          console.log('resolving stream request', extracted.complete, detail);
          resolve(detail);
          hasResolved = true;
        } else if (complete) {
          console.log(
            'image_load_stream_partial',
            complete ? 'complete' : 'partial',
            Date.now() - start,
            'ms',
            imageId,
            imageFrame.length
          );
          cornerstone.triggerEvent(
            cornerstone.eventTarget,
            cornerstone.EVENTS.IMAGE_LOAD_STREAM_PARTIAL,
            detail
          );
        }

        if (complete) {
          loadTracking[imageId].loaded = imageFrame.length;
          console.log(
            'IMAGE_LOADED: ',
            Object.values(loadTracking).filter((v) => v.loaded === v.total)
              .length,
            '/',
            Object.keys(loadTracking).length
          );
          cornerstone.triggerEvent(
            cornerstone.eventTarget,
            cornerstone.EVENTS.IMAGE_LOADED,
            { url, imageId }
          );
          break;
        }
      }
    } catch (err: any) {
      errorInterceptor(err);
      console.error(err);
      reject(err);
    }
  });

  return promise;
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
