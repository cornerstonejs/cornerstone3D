import { getOptions, xhrRequest } from '../internal/index';
import rangeRequest from '../internal/rangeRequest';
import streamRequest from '../internal/streamRequest';
import findIndexOfString from './findIndexOfString';
import external from '../../externalModules';
import imageIdToURI from '../imageIdToURI';
import extractMultipart from './extractMultipart';

function getPixelData(
  uri: string,
  imageId: string,
  mediaType = 'application/octet-stream',
  progressivelyRender = false
): Promise<any> {
  const headers = {
    Accept: mediaType,
  };

  return new Promise(async (resolve, reject) => {
    const url = imageIdToURI(imageId);
    const searchParams = new URL(url).searchParams;
    const fsiz = searchParams.get('fsiz');
    const streamMethod = getOptions().streamMethod;

    if (progressivelyRender && !fsiz) {
      const { cornerstone } = external;

      if (streamMethod === 'web-streams') {
        const { contentType, imageFrame } = await streamRequest(
          uri,
          imageId,
          headers
        );
        console.log('Got next web streams', uri, imageId, headers);

        // Resolve the promise with the first streaming result (low quality
        // presumably)
        return resolve(imageFrame);
      } else {
        // Using range request method

        const { contentType, imageFrame, complete, loadNextRange } =
          await rangeRequest(uri, imageId, headers);

        // Resolve the promise with the first streaming result (low quality
        // presumably)
        resolve({
          contentType: contentType || 'application/octet-stream',
          imageFrame: {
            pixelData: imageFrame,
          },
        });

        let fetches = 1;
        const maxFetches = 5;
        let loadComplete = complete;
        while (loadComplete === false && fetches <= maxFetches) {
          const { complete, imageFrame, contentType } = await loadNextRange();
          loadComplete = complete;
          fetches += 1;
          if (!complete) {
            cornerstone.triggerEvent(
              cornerstone.eventTarget,
              cornerstone.EVENTS.IMAGE_LOAD_STREAM_PARTIAL,
              {
                imageId,
                ...extractMultipart(contentType, imageFrame, true),
              }
            );
          } else {
            cornerstone.triggerEvent(
              cornerstone.eventTarget,
              cornerstone.EVENTS.IMAGE_LOADED,
              { imageId }
            );
            cornerstone.triggerEvent(
              cornerstone.eventTarget,
              cornerstone.EVENTS.IMAGE_LOAD_STREAM_COMPLETE,
              {
                imageId,
                ...extractMultipart(contentType, imageFrame),
              }
            );
          }
        }

        return;
      }
    }

    /**
     * Not progressively rendering, use regular xhr request.
     */

    const loadPromise = xhrRequest(uri, imageId, headers);
    const { xhr } = loadPromise;

    loadPromise.then(function (imageFrameAsArrayBuffer /* , xhr*/) {
      const contentType =
        xhr.getResponseHeader('Content-Type') || 'application/octet-stream';
      // const decodeLevel = xhr.getResponseHeader('X-Decode-Level')
      //   ? Number(xhr.getResponseHeader('X-Decode-Level'))
      //   : undefined;

      resolve(extractMultipart(contentType, imageFrameAsArrayBuffer));
    }, reject);
  });
}

export default getPixelData;
