import { ByteArray } from 'dicom-parser';
import openJphFactory from '@cornerstonejs/codec-openjph/wasmjs';
import openjphWasm from '@cornerstonejs/codec-openjph/wasm';

import { LoaderDecodeOptions } from '../../types';

const local: {
  codec: any;
  decoder: any;
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

  const openJphModule = openJphFactory({
    locateFile: (f) => {
      if (f.endsWith('.wasm')) {
        return openjphWasm;
      }

      return f;
    },
  });

  return new Promise<void>((resolve, reject) => {
    openJphModule.then((instance) => {
      local.codec = instance;
      local.decoder = new instance.HTJ2KDecoder();
      resolve();
    }, reject);
  });
}

// https://github.com/chafey/openjpegjs/blob/master/test/browser/index.html
async function decodeAsync(compressedImageFrame: ByteArray, imageInfo) {
  await initialize();
  // const decoder = local.decoder; // This is much slower for some reason
  const decoder = new local.codec.HTJ2KDecoder();

  // get pointer to the source/encoded bit stream buffer in WASM memory
  // that can hold the encoded bitstream
  const encodedBufferInWASM = decoder.getEncodedBuffer(
    compressedImageFrame.length
  );

  // copy the encoded bitstream into WASM memory buffer
  encodedBufferInWASM.set(compressedImageFrame);

  // decode it
  // decoder.decode();
  const decodeLevel = imageInfo.decodeLevel || 0;
  decoder.decodeSubResolution(decodeLevel);
  // decoder.decodeSubResolution(decodeLevel, decodeLayer);
  // const resolutionAtLevel = decoder.calculateSizeAtDecompositionLevel(decodeLevel);

  // get information about the decoded image
  const frameInfo = decoder.getFrameInfo();
  // Overwrite width/height if subresolution
  if (imageInfo.decodeLevel > 0) {
    const { width, height } = calculateSizeAtDecompositionLevel(
      imageInfo.decodeLevel,
      frameInfo.width,
      frameInfo.height
    );
    frameInfo.width = width;
    frameInfo.height = height;
    // console.log(`Decoded sub-resolution of size: ${width} x ${height}`);
  }
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
  // const colorTransform = decoder.getColorSpace();

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
  // const pixelData = getPixelData(frameInfo, decodedBufferInWASM);

  /**
   * Have to truncate the arraybuffer here to the length of the typed array. Not
   * sure why the arraybuffer is so huge, maybe this is allocated by the WASM
   * module? In any case, I think it's too big to postMessage in it's entirety.
   */
  let pixelData = getPixelData(frameInfo, decodedBufferInWASM);
  const { buffer: b, byteOffset, byteLength } = pixelData;
  const pixelDataArrayBuffer = b.slice(byteOffset, byteOffset + byteLength);

  // @ts-ignore
  pixelData = new pixelData.constructor(pixelDataArrayBuffer);

  const encodeOptions = {
    imageOffset,
    numDecompositions,
    numLayers,
    progessionOrder,
    reversible,
    blockDimensions,
    tileSize,
    tileOffset,
    // colorTransform,
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
