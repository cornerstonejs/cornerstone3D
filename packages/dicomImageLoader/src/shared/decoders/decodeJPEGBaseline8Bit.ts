// @ts-ignore
import libjpegTurboFactory from '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs';
import type {
  LibJpegTurbo8Bit,
  OpenJpegModule,
} from '@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbowasm_decode';
import type { Types } from '@cornerstonejs/core';
import type { ByteArray } from 'dicom-parser';

/**
 * Default URL to load the LibJpeg Turbo 8bit codec from.
 *
 * In order for this to be loaded correctly, you will need to configure your
 * bundler to treat `.wasm` files as an asset/resource.
 */
const libjpegTurboWasm = new URL(
  '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasm',
  import.meta.url
);

const local: {
  codec: OpenJpegModule;
  decoder: LibJpegTurbo8Bit;
} = {
  codec: undefined,
  decoder: undefined,
};

/**
 *
 * @param [wasmUrlCodecLibjpegTurbo8bit] - Optional URL for the codec WASM file.
 * If not provided, it will default to the `libjpegTurboWasm` URL.
 * @returns
 */
function initLibjpegTurbo(
  wasmUrlCodecLibjpegTurbo8bit?: string
): Promise<void> {
  if (local.codec) {
    return Promise.resolve();
  }

  const libjpegTurboModule = libjpegTurboFactory({
    locateFile: (f: string) => {
      if (f.endsWith('.wasm')) {
        /**
         * If a custom URL is provided, use that instead of the default one.
         */
        if (wasmUrlCodecLibjpegTurbo8bit) {
          return wasmUrlCodecLibjpegTurbo8bit;
        }
        return libjpegTurboWasm.toString();
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
  imageInfo,
  wasmUrlCodecLibjpegTurbo8bit?: string
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

export default decodeAsync;
