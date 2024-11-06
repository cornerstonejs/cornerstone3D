import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';

async function decodeJPEGLossless(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray
): Promise<Types.IImageFrame> {
  const byteOutput = imageFrame.bitsAllocated <= 8 ? 1 : 2;
  const { Decoder } = await import('jpeg-lossless-decoder-js');
  const buffer = pixelData.buffer;
  const decoder = new Decoder();
  const decompressedData = decoder.decode(
    buffer,
    pixelData.byteOffset,
    pixelData.length,
    byteOutput
  );

  if (imageFrame.pixelRepresentation === 0) {
    if (imageFrame.bitsAllocated === 16) {
      imageFrame.pixelData = new Uint16Array(decompressedData.buffer);

      return imageFrame;
    }
    imageFrame.pixelData = new Uint8Array(decompressedData.buffer);

    return imageFrame;
  }
  imageFrame.pixelData = new Int16Array(decompressedData.buffer);

  return imageFrame;
}

export default decodeJPEGLossless;
