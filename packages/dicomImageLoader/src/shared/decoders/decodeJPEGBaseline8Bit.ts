import type {
  LibJpegTurbo8Bit,
  OpenJpegModule,
} from '@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbowasm_decode';
// @ts-ignore
import libjpegTurboFactory from '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs';

// @ts-ignore
// import libjpegTurboWasm from '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasm';
const libjpegTurboWasm = new URL(
  '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasm',
  import.meta.url
);
import type { Types } from '@cornerstonejs/core';
import type { LoaderDecodeOptions } from '../../types';
import getPixelData from './getPixelData';
import { resolveWasmUrl, setWasmBasePathFromConfig } from '../wasmBasePath';

const local: {
  codec: OpenJpegModule;
  decoder: LibJpegTurbo8Bit;
} = {
  codec: undefined,
  decoder: undefined,
};

function initLibjpegTurbo(decodeConfig?: LoaderDecodeOptions): Promise<void> {
  setWasmBasePathFromConfig(decodeConfig);

  if (local.codec) {
    return Promise.resolve();
  }

  const libjpegTurboModule = libjpegTurboFactory({
    locateFile: (f) => {
      if (f.endsWith('.wasm')) {
        return resolveWasmUrl('libjpegturbowasm_decode.wasm', libjpegTurboWasm);
      }

      return f;
    },
  });

  return new Promise((resolve, reject) => {
    libjpegTurboModule.then((instance) => {
      local.codec = instance;
      local.decoder = new instance.JPEGDecoder();
      resolve();
    }, reject);
  });
}

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
  await initLibjpegTurbo();
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

const initialize = initLibjpegTurbo;

export { initialize };

export default decodeAsync;
