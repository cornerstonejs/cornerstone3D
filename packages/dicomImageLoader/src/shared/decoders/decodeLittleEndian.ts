import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';

async function decodeLittleEndian(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray
): Promise<Types.IImageFrame> {
  let arrayBuffer = pixelData.buffer;

  let offset = pixelData.byteOffset;
  const length = pixelData.length;

  if (imageFrame.bitsAllocated === 16 || imageFrame.bitsAllocated === 12) {
    // if pixel data is not aligned on even boundary, shift it so we can create the 16 bit array
    // buffers on it
    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }

    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint16Array(arrayBuffer, offset, length / 2);
    } else {
      imageFrame.pixelData = new Int16Array(arrayBuffer, offset, length / 2);
    }
  } else if (imageFrame.bitsAllocated === 8 || imageFrame.bitsAllocated === 1) {
    imageFrame.pixelData = pixelData;
  } else if (imageFrame.bitsAllocated === 32) {
    // if pixel data is not aligned on even boundary, shift it
    if (offset % 2) {
      arrayBuffer = arrayBuffer.slice(offset);
      offset = 0;
    }

    // @ts-expect-error
    if (imageFrame.floatPixelData || imageFrame.doubleFloatPixelData) {
      throw new Error(
        'Float pixel data is not supported for parsing into ImageFrame'
      );
    }

    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint32Array(arrayBuffer, offset, length / 4);
    } else if (imageFrame.pixelRepresentation === 1) {
      imageFrame.pixelData = new Int32Array(arrayBuffer, offset, length / 4);
    } else {
      imageFrame.pixelData = new Float32Array(arrayBuffer, offset, length / 4);
    }
  }

  return imageFrame;
}

export default decodeLittleEndian;
