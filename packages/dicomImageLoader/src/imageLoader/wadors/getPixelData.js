import { xhrRequest } from '../internal/index.js';
import findIndexOfString from './findIndexOfString.js';

function findBoundary(header) {
  for (let i = 0; i < header.length; i++) {
    if (header[i].substr(0, 2) === '--') {
      return header[i];
    }
  }
}

function findContentType(header) {
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

function getPixelData(uri, imageId, mediaType = 'application/octet-stream') {
  const headers = {
    Accept: mediaType,
  };

  return new Promise((resolve, reject) => {
    const loadPromise = xhrRequest(uri, imageId, headers);
    const { xhr } = loadPromise;

    loadPromise.then(function (imageFrameAsArrayBuffer) {
      // request succeeded, Parse the multi-part mime response
      const response = new Uint8Array(imageFrameAsArrayBuffer);

      const contentType =
        xhr.getResponseHeader('Content-Type') || 'application/octet-stream';

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
        },
      });
    }, reject);
  });
}

export default getPixelData;
