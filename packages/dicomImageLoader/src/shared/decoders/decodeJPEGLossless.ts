import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';
import type { WebWorkerDecodeConfig } from '../../types';

const local = {
  DecoderClass: undefined,
  decodeConfig: {} as WebWorkerDecodeConfig,
};

export function initialize(
  decodeConfig?: WebWorkerDecodeConfig
): Promise<void> {
  local.decodeConfig = decodeConfig;

  if (local.DecoderClass) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    import('jpeg-lossless-decoder-js').then(({ Decoder }) => {
      local.DecoderClass = Decoder;
      resolve();
    }, reject);
  });
}

async function decodeJPEGLossless(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray
): Promise<Types.IImageFrame> {
  await initialize();

  // check to make sure codec is loaded
  if (typeof local.DecoderClass === 'undefined') {
    throw new Error('No JPEG Lossless decoder loaded');
  }

  // Create a new decoder instance for each decode operation to ensure thread safety
  const decoder = new local.DecoderClass();

  const byteOutput = imageFrame.bitsAllocated <= 8 ? 1 : 2;
  const buffer = pixelData.buffer;
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
    // untested!
    imageFrame.pixelData = new Uint8Array(decompressedData.buffer);

    return imageFrame;
  }
  imageFrame.pixelData = new Int16Array(decompressedData.buffer);

  return imageFrame;
}

export default decodeJPEGLossless;
