const CRLF = [13, 10];
const HEADER_END = [13, 10, 13, 10];
const DASH_DASH = [45, 45];

/**
 * Splits a DICOMweb bulkdata response into the body of each part.
 *
 * DICOMweb returns bulkdata as `multipart/related` by default, and a server may
 * return a single part instead. The boundary comes from the `boundary`
 * parameter of `contentType`. When that parameter is missing, the first line of
 * the body gives the boundary, because some servers send
 * `Content-Type: multipart/related` with no parameters.
 *
 * @param response - The response body.
 * @param contentType - The `Content-Type` header of the response. When it is
 *   given and it is not multipart, the body is returned as the only part.
 * @returns The body of each part, without the part headers. A single-part
 *   response returns `[response]`.
 */
export function decodeMultipartRelated(
  response: ArrayBuffer,
  contentType?: string
): ArrayBuffer[] {
  if (contentType && !/multipart/i.test(contentType)) {
    return [response];
  }

  const message = new Uint8Array(response);
  const boundary =
    getBoundaryFromContentType(contentType) ?? getBoundaryFromBody(message);

  if (!boundary) {
    return [response];
  }

  const delimiter = Array.from(new TextEncoder().encode(`--${boundary}`));
  const parts: ArrayBuffer[] = [];
  let index = indexOf(message, delimiter, 0);

  while (index !== -1) {
    const afterDelimiter = index + delimiter.length;

    if (startsWith(message, DASH_DASH, afterDelimiter)) {
      break;
    }

    const headerEnd = indexOf(message, HEADER_END, afterDelimiter);
    if (headerEnd === -1) {
      break;
    }

    const dataStart = headerEnd + HEADER_END.length;
    const next = indexOf(message, [...CRLF, ...delimiter], dataStart);
    const dataEnd = next === -1 ? message.length : next;

    parts.push(response.slice(dataStart, dataEnd));
    index = next === -1 ? -1 : next + CRLF.length;
  }

  return parts.length ? parts : [response];
}

function getBoundaryFromContentType(contentType?: string): string | undefined {
  const match = contentType?.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);

  return match ? (match[1] ?? match[2]) : undefined;
}

function getBoundaryFromBody(message: Uint8Array): string | undefined {
  if (!startsWith(message, DASH_DASH, 0)) {
    return undefined;
  }

  const lineEnd = indexOf(message, CRLF, 0, 200);
  if (lineEnd <= DASH_DASH.length) {
    return undefined;
  }

  return new TextDecoder().decode(message.subarray(DASH_DASH.length, lineEnd));
}

function startsWith(message: Uint8Array, token: number[], at: number) {
  return token.every((byte, i) => message[at + i] === byte);
}

function indexOf(
  message: Uint8Array,
  token: number[],
  from: number,
  maxLength = message.length
): number {
  const end = Math.min(message.length, from + maxLength) - token.length;

  for (let i = from; i <= end; i++) {
    if (message[i] === token[0] && startsWith(message, token, i)) {
      return i;
    }
  }

  return -1;
}
