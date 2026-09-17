import type { ByteArray } from 'dicom-parser';
import isSignedPixelData from './isSignedPixelData';

interface DecodedFrameInfo {
  bitsPerSample?: number;
  isSigned?: boolean | number;
  componentCount?: number;
}

/**
 * Wraps a codec's decoded output in the typed array its samples should be read
 * as.
 *
 * Every WASM codec decodes into a flat byte buffer and then has to pick a view
 * over it, and they all pick it the same way: 16 bit samples when bitsPerSample
 * is above 8, 8 bit otherwise, signed or unsigned per {@link isSignedPixelData}.
 * This lived as four separate copies - JPEG 2000, HTJ2K, JPEG-LS and JPEG
 * baseline - which is how the signed color bug got fixed in one of them while
 * the other three kept rendering the same file wrong.
 *
 * @param frameInfo - decoded frame info, as the codecs report it
 * @param decodedBuffer - the codec's decoded output buffer
 * @param signedOverride - signedness taken from DICOM metadata, for codecs whose
 *   frame info carries no signed flag of its own (JPEG-LS). When undefined the
 *   flag on frameInfo is used instead.
 */
export default function getPixelData(
  frameInfo: DecodedFrameInfo,
  decodedBuffer: ByteArray,
  signedOverride?: boolean
) {
  const signed = isSignedPixelData({
    isSigned: signedOverride ?? frameInfo?.isSigned,
    componentCount: frameInfo?.componentCount,
  });

  if (frameInfo?.bitsPerSample > 8) {
    if (signed) {
      return new Int16Array(
        decodedBuffer.buffer,
        decodedBuffer.byteOffset,
        decodedBuffer.byteLength / 2
      );
    }

    return new Uint16Array(
      decodedBuffer.buffer,
      decodedBuffer.byteOffset,
      decodedBuffer.byteLength / 2
    );
  }

  if (signed) {
    return new Int8Array(
      decodedBuffer.buffer,
      decodedBuffer.byteOffset,
      decodedBuffer.byteLength
    );
  }

  return new Uint8Array(
    decodedBuffer.buffer,
    decodedBuffer.byteOffset,
    decodedBuffer.byteLength
  );
}
