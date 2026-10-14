import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import pako from 'pako';

import decodeLittleEndian from './decodeLittleEndian';
import { trimToNativeFrame } from './nativeFrameBytes';

/**
 * Decodes one frame of Deflated Image Frame Compression
 * (1.2.840.10008.1.2.8.1).
 *
 * Each frame is separately compressed with the raw Deflate algorithm of
 * RFC 1951 and encapsulated as a single fragment (PS3.5 A.4.13). Raw here is
 * load bearing: the frame carries no zlib header or Adler-32 trailer, so it is
 * `inflateRaw` rather than `inflate`. This is the same framing the whole-
 * dataset Deflated Explicit VR Little Endian syntax uses, applied per frame
 * instead of once over the data set - which is why that syntax is handled by
 * dicomParser at parse time and never reaches here.
 *
 * Inflating yields the frame's native uncompressed pixel data, so the result
 * is interpreted exactly as Explicit VR Little Endian would be.
 */
async function decodeDeflatedFrame(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray
): Promise<Types.IImageFrame> {
  let inflated: Uint8Array;

  try {
    inflated = pako.inflateRaw(
      // pako wants a plain Uint8Array view; a dicom-parser ByteArray already is
      // one, but may be a view onto a much larger buffer.
      new Uint8Array(pixelData.buffer, pixelData.byteOffset, pixelData.length)
    );
  } catch (error) {
    throw new Error(
      `decodeDeflatedFrame: could not inflate the frame (${error})`
    );
  }

  return decodeLittleEndian(
    imageFrame,
    trimToNativeFrame(imageFrame, inflated, 'decodeDeflatedFrame')
  );
}

export default decodeDeflatedFrame;
