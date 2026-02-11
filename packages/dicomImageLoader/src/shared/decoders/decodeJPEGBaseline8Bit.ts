import type {
  LibJpegTurbo8Bit,
  OpenJpegModule,
} from '@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbowasm_decode';
import type { Types } from '@cornerstonejs/core';
import { createInitializeDecoder } from '../createInitializeDecoder';
import type { ByteArray } from 'dicom-parser';

const { initialize, state } = createInitializeDecoder({
  library: '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
  libraryFallback: () =>
    import('@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs'),
  wasm: '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasm',
  wasmDefaultUrl: new URL(
    '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasm',
    import.meta.url
  ).toString(),
  constructor: 'JPEGDecoder',
});
const local = state as {
  codec: OpenJpegModule;
  decoder: LibJpegTurbo8Bit;
  decodeConfig: typeof state.decodeConfig;
};

// imageFrame.pixelRepresentation === 1 <-- Signed
/**
 *
 * @param {*} compressedImageFrame
 * @param {object}  imageInfo
 * @param {boolean} imageInfo.signed -
 */
async function decodeAsync(
  compressedImageFrame,
  imageInfo
): Promise<Types.IImageFrame> {
  await initialize();
  const decoder = local.decoder;

  // get pointer to the source/encoded bit stream buffer in WASM memory
  // that can hold the encoded bitstream
  const encodedBufferInWASM = decoder.getEncodedBuffer(
    compressedImageFrame.length
  );

  // copy the encoded bitstream into WASM memory buffer
  encodedBufferInWASM.set(compressedImageFrame);

  // decode it
  decoder.decode();

  // get information about the decoded image
  const frameInfo = decoder.getFrameInfo();

  // get the decoded pixels
  const decodedPixelsInWASM = decoder.getDecodedBuffer();

  const encodedImageInfo = {
    columns: frameInfo.width,
    rows: frameInfo.height,
    bitsPerPixel: frameInfo.bitsPerSample,
    signed: imageInfo.signed,
    bytesPerPixel: imageInfo.bytesPerPixel,
    componentsPerPixel: frameInfo.componentCount,
  };

  const pixelData = getPixelData(frameInfo, decodedPixelsInWASM);

  const encodeOptions = {
    frameInfo,
  };

  return {
    ...imageInfo,
    pixelData,
    imageInfo: encodedImageInfo,
    encodeOptions,
    ...encodeOptions,
    ...encodedImageInfo,
  };
}

function getPixelData(frameInfo, decodedBuffer: ByteArray) {
  if (frameInfo.isSigned) {
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

export { initialize };

export default decodeAsync;
