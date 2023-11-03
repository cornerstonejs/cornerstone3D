import { Enums } from '@cornerstonejs/core';
import findIndexOfString from './findIndexOfString';

const { ImageQualityStatus } = Enums;
/**
 * Extracts multipart/related data or single part data from a response byte
 * array.
 *
 * @param contentType - guess of the root content type
 * @param imageFrameAsArrayBuffer - array buffer containing the image frame
 * @param options - contains already computed values from
 *        earlier calls, allowing additional calls to be made to fetch
 *        additional data.
 * @param isPartial - indicates the file may end partially
 * @returns a compressed image frame containing the pixel data.
 */
export default function extractMultipart(
  contentType: string,
  imageFrameAsArrayBuffer,
  options?
) {
  options ||= {};
  // request succeeded, Parse the multi-part mime response
  const response = new Uint8Array(imageFrameAsArrayBuffer);
  const isPartial = !!options?.isPartial;
  if (contentType.indexOf('multipart') === -1) {
    return {
      contentType,
      imageQualityStatus: isPartial
        ? ImageQualityStatus.SUBRESOLUTION
        : ImageQualityStatus.FULL_RESOLUTION,
      pixelData: response,
    };
  }

  let { tokenIndex, responseHeaders, boundary, multipartContentType } = options;

  // First look for the multipart mime header
  tokenIndex ||= findIndexOfString(response, '\r\n\r\n');

  if (tokenIndex === -1) {
    throw new Error('invalid response - no multipart mime header');
  }

  if (!boundary) {
    const header = uint8ArrayToString(response, 0, tokenIndex);
    // Now find the boundary  marker
    responseHeaders = header.split('\r\n');
    boundary = findBoundary(responseHeaders);

    if (!boundary) {
      throw new Error('invalid response - no boundary marker');
    }
  }
  const offset = tokenIndex + 4; // skip over the \r\n\r\n

  // find the terminal boundary marker
  const endIndex = findIndexOfString(response, boundary, offset);

  if (endIndex === -1 && !isPartial) {
    throw new Error('invalid response - terminating boundary not found');
  }

  multipartContentType ||= findContentType(responseHeaders);

  options.tokenIndex = tokenIndex;
  options.boundary = boundary;
  options.responseHeaders = responseHeaders;
  options.multipartContentType = multipartContentType;
  options.isPartial = endIndex === -1;

  // return the info for this pixel data
  return {
    contentType: multipartContentType,
    // done indicates if the read has finished the entire image, not if
    // the image is completely available
    extractDone: !isPartial || endIndex !== -1,
    tokenIndex,
    responseHeaders,
    boundary,
    multipartContentType,
    // Exclude the \r\n as well as the boundary
    pixelData: imageFrameAsArrayBuffer.slice(offset, endIndex - 2),
  };
}

export function findBoundary(header: string[]): string {
  for (let i = 0; i < header.length; i++) {
    if (header[i].substr(0, 2) === '--') {
      return header[i];
    }
  }
}

export function findContentType(header: string[]): string {
  for (let i = 0; i < header.length; i++) {
    if (header[i].substr(0, 13) === 'Content-Type:') {
      return header[i].substr(13).trim();
    }
  }
}

export function uint8ArrayToString(data, offset, length) {
  offset = offset || 0;
  length = length || data.length - offset;
  let str = '';

  for (let i = offset; i < offset + length; i++) {
    str += String.fromCharCode(data[i]);
  }

  return str;
}
