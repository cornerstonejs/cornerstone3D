/* eslint-disable @typescript-eslint/no-explicit-any */
import { Enums } from '@cornerstonejs/core';
import extractMultipart, {
  findBoundary,
  findContentType,
  uint8ArrayToString,
} from '../imageLoader/wadors/extractMultipart';

const { ImageQualityStatus } = Enums;

function strToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  // Ensure we get a plain ArrayBuffer that exactly matches the Uint8Array's
  // bytes (mirrors what fetch()/XHR would hand back).
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

describe('extractMultipart', () => {
  describe('findBoundary', () => {
    it('returns the first header line starting with --', () => {
      const headers = [
        'Content-Type: multipart/related',
        '--theBoundary123',
        'Content-Type: application/octet-stream',
      ];
      expect(findBoundary(headers)).toBe('--theBoundary123');
    });

    it('returns undefined when no boundary line is present', () => {
      const headers = ['Content-Type: multipart/related', 'Content-Length: 42'];
      expect(findBoundary(headers)).toBeUndefined();
    });

    it('returns undefined for an empty header array', () => {
      expect(findBoundary([])).toBeUndefined();
    });
  });

  describe('findContentType', () => {
    it('finds a Content-Type header and trims the value', () => {
      const headers = [
        '--theBoundary123',
        'Content-Type:   application/octet-stream  ',
      ];
      expect(findContentType(headers)).toBe('application/octet-stream');
    });

    it('returns undefined when no Content-Type header is present', () => {
      const headers = ['--theBoundary123', 'Content-Length: 42'];
      expect(findContentType(headers)).toBeUndefined();
    });
  });

  describe('uint8ArrayToString', () => {
    it('converts a full Uint8Array to a string', () => {
      const bytes = strToBytes('hello world');
      expect(uint8ArrayToString(bytes, 0, bytes.length)).toBe('hello world');
    });

    it('honors offset and length', () => {
      const bytes = strToBytes('0123456789');
      expect(uint8ArrayToString(bytes, 3, 4)).toBe('3456');
    });

    it('defaults offset to 0 and length to data.length - offset when omitted', () => {
      const bytes = strToBytes('abcdef');
      expect(uint8ArrayToString(bytes, undefined, undefined)).toBe('abcdef');
      expect(uint8ArrayToString(bytes, 2, undefined)).toBe('cdef');
    });

    it('handles raw byte values via String.fromCharCode (not UTF-8 decoding)', () => {
      const bytes = new Uint8Array([0x41, 0x42, 0xff, 0x00]);
      const result = uint8ArrayToString(bytes, 0, bytes.length);
      expect(result).toBe(String.fromCharCode(0x41, 0x42, 0xff, 0x00));
    });
  });

  describe('single-part (non-multipart) responses', () => {
    it('passes the full buffer through as pixelData with FULL_RESOLUTION when not partial', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      const buffer = toArrayBuffer(bytes);

      const result = extractMultipart('image/jpeg', buffer);

      expect(result.contentType).toBe('image/jpeg');
      expect(result.imageQualityStatus).toBe(
        ImageQualityStatus.FULL_RESOLUTION
      );
      expect(Array.from(result.pixelData as Uint8Array)).toEqual([
        1, 2, 3, 4, 5,
      ]);
    });

    it('reports SUBRESOLUTION when options.isPartial is set', () => {
      const bytes = new Uint8Array([9, 8, 7]);
      const buffer = toArrayBuffer(bytes);

      const result = extractMultipart('image/jpeg', buffer, {
        isPartial: true,
      });

      expect(result.imageQualityStatus).toBe(ImageQualityStatus.SUBRESOLUTION);
      expect(Array.from(result.pixelData as Uint8Array)).toEqual([9, 8, 7]);
    });

    it('does not require options to be passed at all', () => {
      const bytes = new Uint8Array([42]);
      const buffer = toArrayBuffer(bytes);
      const result = extractMultipart('text/plain', buffer);
      expect(result.imageQualityStatus).toBe(
        ImageQualityStatus.FULL_RESOLUTION
      );
    });
  });

  describe('full multipart parsing', () => {
    function buildMultipart(
      bodyBytes: Uint8Array,
      boundary = '--theBoundary123'
    ) {
      const header = strToBytes(
        `${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
      );
      const trailer = strToBytes(`\r\n${boundary}--`);
      const full = concatBytes(header, bodyBytes, trailer);
      return {
        full,
        headerLength: header.length,
        bodyLength: bodyBytes.length,
      };
    }

    it('extracts exactly the body bytes between the mime header and the terminating boundary', () => {
      const bodyBytes = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0x10]);
      const { full, headerLength, bodyLength } = buildMultipart(bodyBytes);
      const buffer = toArrayBuffer(full);

      const result = extractMultipart('multipart/related', buffer);

      expect(result.contentType).toBe('application/octet-stream');
      expect(result.multipartContentType).toBe('application/octet-stream');
      expect(result.boundary).toBe('--theBoundary123');
      expect(result.extractDone).toBe(true);
      expect(result.tokenIndex).toBe(headerLength - 4);

      const extracted = new Uint8Array(result.pixelData as ArrayBuffer);
      expect(Array.from(extracted)).toEqual(Array.from(bodyBytes));
      expect(extracted.length).toBe(bodyLength);

      // Exact byte-offset assertions against the original buffer.
      const original = new Uint8Array(buffer);
      const offset = result.tokenIndex + 4;
      expect(Array.from(original.slice(offset, offset + bodyLength))).toEqual(
        Array.from(bodyBytes)
      );
    });

    it('parses responseHeaders by splitting the mime header on CRLF', () => {
      const bodyBytes = strToBytes('BODY');
      const { full } = buildMultipart(bodyBytes);
      const buffer = toArrayBuffer(full);

      const result = extractMultipart('multipart/related', buffer);

      expect(result.responseHeaders).toEqual([
        '--theBoundary123',
        'Content-Type: application/octet-stream',
      ]);
    });

    it('handles a boundary containing extra header lines before it', () => {
      const boundary = '--myBoundary';
      const header = strToBytes(
        `Content-Length: 1234\r\n${boundary}\r\nContent-Type: image/dicom+jls\r\n\r\n`
      );
      const bodyBytes = new Uint8Array([7, 7, 7]);
      const trailer = strToBytes(`\r\n${boundary}--`);
      const full = concatBytes(header, bodyBytes, trailer);
      const buffer = toArrayBuffer(full);

      const result = extractMultipart('multipart/related', buffer);

      expect(result.boundary).toBe(boundary);
      expect(result.multipartContentType).toBe('image/dicom+jls');
      expect(
        Array.from(new Uint8Array(result.pixelData as ArrayBuffer))
      ).toEqual([7, 7, 7]);
    });
  });

  describe('partial-content bookkeeping', () => {
    it('marks isPartial=true and extractDone=false when the terminating boundary has not arrived yet, and does not throw', () => {
      const boundary = '--theBoundary123';
      const header = strToBytes(
        `${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
      );
      // No terminating boundary yet - simulates a chunk still streaming in.
      const partialBody = new Uint8Array([1, 2, 3, 4]);
      const full = concatBytes(header, partialBody);
      const buffer = toArrayBuffer(full);

      const options: Record<string, unknown> = { isPartial: true };
      const result = extractMultipart('multipart/related', buffer, options);

      expect(result.extractDone).toBe(false);
      expect(result.boundary).toBe(boundary);
      expect(result.tokenIndex).toBe(header.length - 4);
      // isPartial bookkeeping is written onto the options object, not the
      // returned result object.
      expect(options.isPartial).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result as any).isPartial).toBeUndefined();
    });

    it('carries tokenIndex/boundary/responseHeaders forward across subsequent calls via options', () => {
      const boundary = '--theBoundary123';
      const header = strToBytes(
        `${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
      );
      const partialBody = new Uint8Array([1, 2, 3, 4]);
      const firstBuffer = toArrayBuffer(concatBytes(header, partialBody));

      const options: Record<string, unknown> = { isPartial: true };
      const firstResult = extractMultipart(
        'multipart/related',
        firstBuffer,
        options
      );
      expect(firstResult.extractDone).toBe(false);

      // options object is mutated in place with bookkeeping fields.
      expect(options.tokenIndex).toBe(header.length - 4);
      expect(options.boundary).toBe(boundary);
      expect(options.multipartContentType).toBe('application/octet-stream');
      expect(options.isPartial).toBe(true);

      // Second call: more bytes have arrived, including the terminating boundary.
      const moreBody = new Uint8Array([1, 2, 3, 4, 5, 6]);
      const trailer = strToBytes(`\r\n${boundary}--`);
      const secondBuffer = toArrayBuffer(
        concatBytes(header, moreBody, trailer)
      );

      const secondResult = extractMultipart(
        'multipart/related',
        secondBuffer,
        options
      );

      expect(secondResult.extractDone).toBe(true);
      expect(
        Array.from(new Uint8Array(secondResult.pixelData as ArrayBuffer))
      ).toEqual(Array.from(moreBody));
    });
  });

  describe('malformed inputs', () => {
    it('throws when there is no multipart mime header (no \\r\\n\\r\\n at all)', () => {
      const bytes = strToBytes('no header separator here at all');
      const buffer = toArrayBuffer(bytes);

      expect(() => extractMultipart('multipart/related', buffer)).toThrow(
        'invalid response - no multipart mime header'
      );
    });

    it('throws when the mime header has no boundary marker line', () => {
      const bytes = strToBytes(
        'Content-Type: application/octet-stream\r\n\r\nBODYDATA'
      );
      const buffer = toArrayBuffer(bytes);

      expect(() => extractMultipart('multipart/related', buffer)).toThrow(
        'invalid response - no boundary marker'
      );
    });

    it('throws when the terminating boundary is not found and the response is not partial', () => {
      const boundary = '--theBoundary123';
      const bytes = strToBytes(
        `${boundary}\r\nContent-Type: application/octet-stream\r\n\r\nBODYDATA-with-no-closing-boundary`
      );
      const buffer = toArrayBuffer(bytes);

      expect(() => extractMultipart('multipart/related', buffer)).toThrow(
        'invalid response - terminating boundary not found'
      );
    });

    it('does not throw for a missing terminating boundary when isPartial is set', () => {
      const boundary = '--theBoundary123';
      const bytes = strToBytes(
        `${boundary}\r\nContent-Type: application/octet-stream\r\n\r\nBODYDATA-with-no-closing-boundary`
      );
      const buffer = toArrayBuffer(bytes);

      expect(() =>
        extractMultipart('multipart/related', buffer, { isPartial: true })
      ).not.toThrow();
    });
  });
});
