import type {
  CharlsModule,
  JpegLSDecoder,
} from '@cornerstonejs/codec-charls/dist/charlswasm_decode';
// @ts-ignore
import charlsFactory from '@cornerstonejs/codec-charls/decodewasmjs';
// @ts-ignore
// import charlsWasm from '@cornerstonejs/codec-charls/decodewasm';
const charlsWasm = new URL(
  '@cornerstonejs/codec-charls/decodewasm',
  import.meta.url
);
import type { ByteArray } from 'dicom-parser';
import type { WebWorkerDecodeConfig } from '../../types';
import type { Types } from '@cornerstonejs/core/src';

const local: {
  codec: CharlsModule;
  decoder: JpegLSDecoder;
  decodeConfig: WebWorkerDecodeConfig;
} = {
  codec: undefined,
  decoder: undefined,
  decodeConfig: {} as WebWorkerDecodeConfig,
};

function getExceptionMessage(exception) {
  return typeof exception === 'number'
    ? local.codec.getExceptionMessage(exception)
    : exception;
}

export function initialize(
  decodeConfig?: WebWorkerDecodeConfig
): Promise<void> {
  local.decodeConfig = decodeConfig;

  if (local.codec) {
    return Promise.resolve();
  }

  const charlsModule = charlsFactory({
    locateFile: (f) => {
      if (f.endsWith('.wasm')) {
        return charlsWasm.toString();
      }

      return f;
    },
  });

  return new Promise((resolve, reject) => {
    charlsModule.then((instance) => {
      local.codec = instance;
      local.decoder = new instance.JpegLSDecoder();
      resolve();
    }, reject);
  });
}

/**
 *
 * @param {*} compressedImageFrame
 * @param {object}  imageInfo
 * @param {boolean} imageInfo.signed - (pixelRepresentation === 1)
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
    const interleaveMode = decoder.getInterleaveMode();
    const nearLossless = decoder.getNearLossless();

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

    const pixelData = getPixelData(
      frameInfo,
      decodedPixelsInWASM,
      imageInfo.signed
    );

    const encodeOptions = {
      nearLossless,
      interleaveMode,
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
  } catch (error) {
    // Handle cases where WASM throws an error internally, and it only gives JS a number
    // See https://emscripten.org/docs/porting/Debugging.html#handling-c-exceptions-from-javascript
    // TODO: Copy to other codecs as well
    throw getExceptionMessage(error);
  }
}

function getPixelData(frameInfo, decodedBuffer: ByteArray, signed: boolean) {
  if (frameInfo.bitsPerSample > 8) {
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

export default decodeAsync;
