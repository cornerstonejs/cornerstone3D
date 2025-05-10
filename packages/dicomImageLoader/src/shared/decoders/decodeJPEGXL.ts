import type { ByteArray } from 'dicom-parser';
// @ts-ignore
import libjxlFactory from '@cornerstonejs/codec-libjxl';
// @ts-ignore
// import libjxlWasm from '@cornerstonejs/codec-libjxl/wasm';
const libjxlWasm = new URL('@cornerstonejs/codec-libjxl/wasm', import.meta.url);

import type { LoaderDecodeOptions } from '../../types';

const local: {
  codec: unknown;
  decoder: unknown;
  decodeConfig: LoaderDecodeOptions;
} = {
  codec: undefined,
  decoder: undefined,
  decodeConfig: {},
};

function calculateSizeAtDecompositionLevel(
  decompositionLevel: number,
  frameWidth: number,
  frameHeight: number
) {
  const result = { width: frameWidth, height: frameHeight };
  while (decompositionLevel > 0) {
    result.width = Math.ceil(result.width / 2);
    result.height = Math.ceil(result.height / 2);
    decompositionLevel--;
  }
  return result;
}

export function initialize(decodeConfig?: LoaderDecodeOptions): Promise<void> {
  local.decodeConfig = decodeConfig;

  if (local.codec) {
    return Promise.resolve();
  }

  const libjxlModule = libjxlFactory({
    locateFile: (f) => {
      if (f.endsWith('.wasm')) {
        return libjxlWasm.toString();
      }

      return f;
    },
  });

  return new Promise<void>((resolve, reject) => {
    libjxlModule.then((instance) => {
      local.codec = instance;
      local.decoder = new instance.JpegXLDecoder();
      resolve();
    }, reject);
  });
}

// https://github.com/chafey/openjpegjs/blob/master/test/browser/index.html
async function decodeAsync(compressedImageFrame: ByteArray, imageInfo) {
  await initialize();
  debugger;
  // const decoder = local.decoder;
  const decoder = new local.codec.JpegXLDecoder();

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
  console.log('frameInfo=', frameInfo);

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

  console.log('decodedPixelsInWASM', decodedPixelsInWASM);
  const pixelData = getPixelData(
    frameInfo,
    decodedPixelsInWASM,
    imageInfo.signed
  );

  const encodeOptions = {
    frameInfo,
  };

  // local.codec.doLeakCheck();

  return {
    ...imageInfo,
    pixelData,
    imageInfo: encodedImageInfo,
    encodeOptions,
    ...encodeOptions,
    ...encodedImageInfo,
  };
}

function getPixelData(frameInfo, decodedBuffer) {
  if (frameInfo.bitsPerSample > 8) {
    if (frameInfo.isSigned) {
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

export default decodeAsync;
