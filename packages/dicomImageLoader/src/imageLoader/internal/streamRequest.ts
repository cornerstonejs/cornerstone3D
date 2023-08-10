import external from '../../externalModules';
import { getOptions } from './options';
import {
  LoaderXhrRequestError,
  LoaderXhrRequestParams,
  LoaderXhrRequestPromise,
} from '../../types';

const streamCache: {
  [key: string]: { byteArray: Uint8Array; currentChunkSize: number };
} = {};
// const minChunkSize = 65_536 * 2;
// const minChunkSize = 3_000_000;
const minChunkSize = 80_000;

function appendChunk(options: {
  imageId: string;
  chunk?: Uint8Array;
  complete?: boolean;
}) {
  const { imageId, chunk, complete } = options;

  // If we have a new chunk of data to append, append it to the Uint8Array for
  // that imageId
  if (!complete) {
    const existingDataForImageId = streamCache[imageId];
    if (!existingDataForImageId) {
      streamCache[imageId] = { byteArray: chunk, currentChunkSize: 0 };
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

export default function streamRequest(
  url: string,
  imageId: string,
  defaultHeaders: Record<string, string> = {},
  params: LoaderXhrRequestParams = {}
): LoaderXhrRequestPromise<{ contentType: string; imageFrame: Uint8Array }> {
  const { cornerstone } = external;
  const options = getOptions();

  const errorInterceptor = (err: any) => {
    if (typeof options.errorInterceptor === 'function') {
      const error = new Error('request failed') as LoaderXhrRequestError;

      // error.request = xhr;
      // error.response = xhr.response;
      // error.status = xhr.status;
      options.errorInterceptor(error);
    }
  };

  // Make the request for the streamable image frame (i.e. HTJ2K)
  const promise = new Promise<{ contentType: string; imageFrame: Uint8Array }>(
    async (resolve, reject) => {
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

        // for await (const chunk of response.body as unknown as Iterable<
        //   ReadableStream<Uint8Array>
        // >) {

        // }
        while (true) {
          const { done, value } = await responseReader.read();
          if (done) {
            const imageFrame = appendChunk({
              imageId,
              complete: true,
            });
            console.log('Finished reading streaming file');
            cornerstone.triggerEvent(
              cornerstone.eventTarget,
              cornerstone.EVENTS.IMAGE_LOADED,
              { url, imageId }
            );
            cornerstone.triggerEvent(
              cornerstone.eventTarget,
              cornerstone.EVENTS.IMAGE_LOAD_STREAM_COMPLETE,
              {
                url,
                imageId,
                contentType: responseHeaders.get('content-type'),
                imageFrame,
              }
            );
            break;
          }
          const imageFrame = appendChunk({ imageId, chunk: value });
          if (!imageFrame) continue;

          // When the first chunk of the downloaded image arrives, resolve the
          // request promise with that chunk, so it can be passed through to
          // cornerstone via the usual image loading pathway. All subsequent
          // chunks will be passed and decoded via events.
          if (!hasResolved) {
            resolve({
              contentType: responseHeaders.get('content-type'),
              imageFrame,
            });
            console.log('initial resolve imageid:', imageId, imageFrame.length)
            hasResolved = true;
          } else {
            cornerstone.triggerEvent(
              cornerstone.eventTarget,
              cornerstone.EVENTS.IMAGE_LOAD_STREAM_PARTIAL,
              {
                url,
                imageId,
                contentType: responseHeaders.get('content-type'),
                imageFrame,
              }
            );
          }
        }
      } catch (err: any) {
        errorInterceptor(err);
        console.error(err);
        reject(err);
      }
    }
  );

  return promise;
}
