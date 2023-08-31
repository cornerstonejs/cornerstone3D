import { getOptions, xhrRequest } from '../internal/index';
import rangeRequest from '../internal/rangeRequest';
import streamRequest from '../internal/streamRequest';
import findIndexOfString from './findIndexOfString';
import external from '../../externalModules';
import imageIdToURI from '../imageIdToURI';

function findBoundary(header: string[]): string {
  for (let i = 0; i < header.length; i++) {
    if (header[i].substr(0, 2) === '--') {
      return header[i];
    }
  }
}

function findContentType(header: string[]): string {
  for (let i = 0; i < header.length; i++) {
    if (header[i].substr(0, 13) === 'Content-Type:') {
      return header[i].substr(13).trim();
    }
  }
}

function uint8ArrayToString(data, offset, length) {
  offset = offset || 0;
  length = length || data.length - offset;
  let str = '';

  for (let i = offset; i < offset + length; i++) {
    str += String.fromCharCode(data[i]);
  }

  return str;
}

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

        // Resolve the promise with the first streaming result (low quality
        // presumably)
        return resolve({
          contentType: contentType || 'application/octet-stream',
          imageFrame: {
            pixelData: imageFrame,
          },
        });
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
        let maxFetches = 5;
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
                contentType,
                imageFrame,
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
                contentType,
                imageFrame,
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
      // request succeeded, Parse the multi-part mime response
      const response = new Uint8Array(imageFrameAsArrayBuffer);

      const contentType =
        xhr.getResponseHeader('Content-Type') || 'application/octet-stream';
      let decodeLevel = xhr.getResponseHeader('X-Decode-Level')
        ? Number(xhr.getResponseHeader('X-Decode-Level'))
        : undefined;

      if (contentType.indexOf('multipart') === -1) {
        resolve({
          contentType,
          imageFrame: {
            pixelData: response,
          },
        });

        return;
      }

      // First look for the multipart mime header
      const tokenIndex = findIndexOfString(response, '\r\n\r\n');

      if (tokenIndex === -1) {
        reject(new Error('invalid response - no multipart mime header'));
      }
      const header = uint8ArrayToString(response, 0, tokenIndex);
      // Now find the boundary  marker
      const split = header.split('\r\n');
      const boundary = findBoundary(split);

      if (!boundary) {
        reject(new Error('invalid response - no boundary marker'));
      }
      const offset = tokenIndex + 4; // skip over the \r\n\r\n

      // find the terminal boundary marker
      const endIndex = findIndexOfString(response, boundary, offset);

      if (endIndex === -1) {
        reject(new Error('invalid response - terminating boundary not found'));
      }

      // Remove \r\n from the length
      const length = endIndex - offset - 2;

      // return the info for this pixel data
      resolve({
        contentType: findContentType(split),
        imageFrame: {
          pixelData: new Uint8Array(imageFrameAsArrayBuffer, offset, length),
          decodeLevel,
        },
      });
    }, reject);
  });
}

export default getPixelData;
