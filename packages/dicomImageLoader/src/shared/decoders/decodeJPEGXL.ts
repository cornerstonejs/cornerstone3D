// @ts-ignore - the published codec ships no type declarations
import jpegxlFactory from '@cornerstonejs/codec-libjxl/decodewasmjs';
// @ts-ignore
const jpegxlWasm = new URL(
  '@cornerstonejs/codec-libjxl/decodewasm',
  import.meta.url
);

import type { Types } from '@cornerstonejs/core';
import type { WebWorkerDecodeConfig } from '../../types';
import getPixelData from './getPixelData';
import { resolveWasmUrl, setWasmBasePathFromConfig } from '../wasmBasePath';

const local: {
  codec;
  decoder;
  decodeConfig: WebWorkerDecodeConfig;
} = {
  codec: undefined,
  decoder: undefined,
  decodeConfig: {} as WebWorkerDecodeConfig,
};

function getExceptionMessage(exception) {
  // Emscripten hands a C++ exception to JS as a pointer when exception catching
  // is compiled in, so the message has to be looked up rather than read.
  return typeof exception === 'number' && local.codec?.getExceptionMessage
    ? local.codec.getExceptionMessage(exception)
    : exception;
}

export function initialize(
  decodeConfig?: WebWorkerDecodeConfig
): Promise<void> {
  local.decodeConfig = decodeConfig;
  setWasmBasePathFromConfig(decodeConfig);

  if (local.codec) {
    return Promise.resolve();
  }

  const jpegxlModule = jpegxlFactory({
    locateFile: (f) => {
      if (f.endsWith('.wasm')) {
        return resolveWasmUrl('jpegxlwasm_decode.wasm', jpegxlWasm);
      }

      return f;
    },
  });

  return new Promise<void>((resolve, reject) => {
    jpegxlModule.then((instance) => {
      local.codec = instance;
      local.decoder = new instance.JpegXLDecoder();
      resolve();
    }, reject);
  });
}

/**
 * Decodes a JPEG XL frame - transfer syntaxes 1.2.840.10008.1.2.4.110
 * (lossless), .111 (JPEG recompression) and .112 (any mode).
 *
 * All three decode identically: the difference between them is what the encoder
 * was allowed to do, not how the codestream is read, so one decoder covers the
 * set (PS3.5 A.4.12).
 *
 * @param compressedImageFrame - one frame's codestream, which for JPEG XL is
 *   one fragment of the encapsulated pixel data
 * @param imageInfo - the image frame, with `signed` taken from
 *   PixelRepresentation by the caller
 */
async function decodeAsync(
  compressedImageFrame,
  imageInfo
): Promise<Types.IImageFrame> {
  try {
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

    // JPEG XL has no signed sample type, so the decoder always reports
    // isSigned false and the signedness has to come from PixelRepresentation
    // in the data set - the same arrangement JPEG-LS uses.
    const pixelData = getPixelData(
      frameInfo,
      decodedPixelsInWASM,
      imageInfo.signed
    );

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
  } catch (error) {
    throw getExceptionMessage(error);
  }
}

export default decodeAsync;
