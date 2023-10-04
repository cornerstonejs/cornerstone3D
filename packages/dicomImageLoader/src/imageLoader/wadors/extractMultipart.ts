import findIndexOfString from './findIndexOfString';

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

export default function extractMultipart(
  contentType: string,
  imageFrameAsArrayBuffer,
  progressiveContent?,
  isPartial = false
) {
  // request succeeded, Parse the multi-part mime response
  const response = new Uint8Array(imageFrameAsArrayBuffer);

  if (contentType.indexOf('multipart') === -1) {
    return {
      contentType,
      complete: !isPartial,
      imageFrame: {
        pixelData: response,
      },
    };
  }

  let { tokenIndex, responseHeaders, boundary, multipartContentType } =
    progressiveContent || {};

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

  const length = endIndex === -1 ? response.length : endIndex - offset - 2;

  multipartContentType ||= findContentType(responseHeaders);

  // return the info for this pixel data
  return {
    ...progressiveContent,
    contentType: multipartContentType,
    complete: !isPartial || endIndex !== -1,
    tokenIndex,
    responseHeaders,
    boundary,
    multipartContentType,
    pixelData: new Uint8Array(imageFrameAsArrayBuffer, offset, length),
  };
}
