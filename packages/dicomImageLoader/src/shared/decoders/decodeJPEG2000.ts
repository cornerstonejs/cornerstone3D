// https://emscripten.org/docs/api_reference/module.html
import type {
  J2KDecoder,
  OpenJpegModule,
} from '@cornerstonejs/codec-openjpeg/dist/openjpegwasm_decode';
// @ts-ignore
import openJpegFactory from '@cornerstonejs/codec-openjpeg/decodewasmjs';

// Webpack asset/resource copies this to our output folder

// TODO: At some point maybe we can use this instead.
// This is closer to what Webpack 5 wants but it doesn't seem to work now
// const wasm = new URL('./blah.wasm', import.meta.url)
// @ts-ignore
// import openjpegWasm from '@cornerstonejs/codec-openjpeg/decodewasm';
const openjpegWasm = new URL(
  '@cornerstonejs/codec-openjpeg/decodewasm',
  import.meta.url
);

import type { Types } from '@cornerstonejs/core/src';
import type { WebWorkerDecodeConfig } from '../../types';

const local: {
  codec: OpenJpegModule;
  decoder: J2KDecoder;
  decodeConfig: WebWorkerDecodeConfig;
} = {
  codec: undefined,
  decoder: undefined,
  decodeConfig: {} as WebWorkerDecodeConfig,
};

export function initialize(
  decodeConfig?: WebWorkerDecodeConfig
): Promise<void> {
  local.decodeConfig = decodeConfig;

  if (local.codec) {
    return Promise.resolve();
  }

  const openJpegModule = openJpegFactory({
    locateFile: (f) => {
      if (f.endsWith('.wasm')) {
        return openjpegWasm.toString();
      }

      return f;
    },
  });

  return new Promise((resolve, reject) => {
    openJpegModule.then((instance) => {
      local.codec = instance;
      local.decoder = new instance.J2KDecoder();
      resolve();
    }, reject);
  });
}

// https://github.com/chafey/openjpegjs/blob/master/test/browser/index.html
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
  // decoder.decodeSubResolution(decodeLevel, decodeLayer);
  // const resolutionAtLevel = decoder.calculateSizeAtDecompositionLevel(decodeLevel);

  // get information about the decoded image
  const frameInfo = decoder.getFrameInfo();
  // get the decoded pixels
  const decodedBufferInWASM = decoder.getDecodedBuffer();
  const imageFrame = new Uint8Array(decodedBufferInWASM.length);

  imageFrame.set(decodedBufferInWASM);

  const imageOffset = `x: ${decoder.getImageOffset().x}, y: ${
    decoder.getImageOffset().y
  }`;
  const numDecompositions = decoder.getNumDecompositions();
  const numLayers = decoder.getNumLayers();
  const progessionOrder = ['unknown', 'LRCP', 'RLCP', 'RPCL', 'PCRL', 'CPRL'][
    decoder.getProgressionOrder() + 1
  ];
  const reversible = decoder.getIsReversible();
  const blockDimensions = `${decoder.getBlockDimensions().width} x ${
    decoder.getBlockDimensions().height
  }`;
  const tileSize = `${decoder.getTileSize().width} x ${
    decoder.getTileSize().height
  }`;
  const tileOffset = `${decoder.getTileOffset().x}, ${
    decoder.getTileOffset().y
  }`;
  const colorTransform = decoder.getColorSpace();

  const decodedSize = `${decodedBufferInWASM.length.toLocaleString()} bytes`;
  const compressionRatio = `${(
    decodedBufferInWASM.length / encodedBufferInWASM.length
  ).toFixed(2)}:1`;

  const encodedImageInfo = {
    columns: frameInfo.width,
    rows: frameInfo.height,
    bitsPerPixel: frameInfo.bitsPerSample,
    signed: frameInfo.isSigned,
    bytesPerPixel: imageInfo.bytesPerPixel,
    componentsPerPixel: frameInfo.componentCount,
  };
  const pixelData = getPixelData(frameInfo, decodedBufferInWASM);

  const encodeOptions = {
    imageOffset,
    numDecompositions,
    numLayers,
    progessionOrder,
    reversible,
    blockDimensions,
    tileSize,
    tileOffset,
    colorTransform,
    decodedSize,
    compressionRatio,
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
