import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import { Decoder } from 'jpeg-lossless-decoder-js';

async function decodeJPEGLossless(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray
): Promise<Types.IImageFrame> {
  const byteOutput = imageFrame.bitsAllocated <= 8 ? 1 : 2;
  // console.time('jpeglossless');
  const buffer = pixelData.buffer;
  const decoder = new Decoder();
  const decompressedData = decoder.decode(
    buffer,
    pixelData.byteOffset,
    pixelData.length,
    byteOutput
  );
  // console.timeEnd('jpeglossless');

  if (imageFrame.pixelRepresentation === 0) {
    if (imageFrame.bitsAllocated === 16) {
      imageFrame.pixelData = new Uint16Array(decompressedData.buffer);

      return imageFrame;
    }
    // untested!
    imageFrame.pixelData = new Uint8Array(decompressedData.buffer);

    return imageFrame;
  }
  imageFrame.pixelData = new Int16Array(decompressedData.buffer);

  return imageFrame;
}

export default decodeJPEGLossless;
