import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';

/**
 * Bytes one frame of native (uncompressed) pixel data occupies.
 *
 * Bits Allocated of 1 is bit packed, so a frame occupies a whole number of
 * bytes rounded up rather than one byte per pixel.
 */
export function nativeFrameLength(imageFrame: Types.IImageFrame): number {
  const { rows, columns, samplesPerPixel, bitsAllocated } = imageFrame;
  const samples = rows * columns * samplesPerPixel;

  if (bitsAllocated === 1) {
    return Math.ceil(samples / 8);
  }

  return samples * (bitsAllocated / 8);
}

/**
 * Trims the padding an encapsulated frame may carry.
 *
 * Encapsulated transfer syntaxes pad a fragment to an even length, and
 * Deflated Image Frame Compression additionally appends a NULL when the
 * deflated stream itself is odd (PS3.5 A.4.11, A.4.13). Either way the frame
 * that arrives can be longer than the pixel data it carries, and handing the
 * surplus on would put a byte count the target buffer does not expect through
 * the rest of the pipeline.
 *
 * A frame *shorter* than its pixel data is a truncation rather than padding,
 * and is thrown rather than silently rendered as a partial image.
 */
export function trimToNativeFrame(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray,
  context: string
): ByteArray {
  const expected = nativeFrameLength(imageFrame);

  if (pixelData.length === expected) {
    return pixelData;
  }

  if (pixelData.length < expected) {
    throw new Error(
      `${context}: frame is ${pixelData.length} bytes, expected ${expected} for ` +
        `${imageFrame.rows}x${imageFrame.columns} with ${imageFrame.samplesPerPixel} ` +
        `sample(s) at ${imageFrame.bitsAllocated} bits`
    );
  }

  return pixelData.subarray(0, expected);
}

/**
 * Drops the pad byte a native (uncompressed) frame may carry.
 *
 * Pixel Data is padded to an even length (PS3.5 7.1.1), so a frame of odd
 * length, such as 8 bit RGB with an odd number of pixels, can arrive one byte
 * longer than its pixels: WADO-RS servers may return the pad byte with the
 * frame. Handed on, the extra byte leaves a sample count that is not a
 * multiple of the samples per pixel, and the frame fails to render.
 *
 * Unlike trimToNativeFrame, a shorter frame is left as it is: native
 * YBR_FULL_422 carries two samples per pixel although Samples per Pixel is 3.
 */
export function dropNativePadding(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray
): ByteArray {
  const expected = nativeFrameLength(imageFrame);

  return pixelData.length > expected
    ? pixelData.subarray(0, expected)
    : pixelData;
}
