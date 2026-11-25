import type { ByteArray } from 'dicom-parser';
import type { Types } from '@cornerstonejs/core';

import decodeLittleEndian from './decodeLittleEndian';
import { trimToNativeFrame } from './nativeFrameBytes';

/**
 * Decodes one frame of Encapsulated Uncompressed Explicit VR Little Endian
 * (1.2.840.10008.1.2.1.98).
 *
 * Nothing is compressed here: the syntax exists so that uncompressed pixel
 * data can use the encapsulated format, one frame per fragment, which makes a
 * single frame addressable without reading the whole Pixel Data element
 * (PS3.5 A.4.11). Each fragment holds that frame's native little endian pixel
 * data, padded to an even length, so the only work is dropping the padding and
 * interpreting the rest as Explicit VR Little Endian.
 */
async function decodeEncapsulatedUncompressed(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray
): Promise<Types.IImageFrame> {
  return decodeLittleEndian(
    imageFrame,
    trimToNativeFrame(imageFrame, pixelData, 'decodeEncapsulatedUncompressed')
  );
}

export default decodeEncapsulatedUncompressed;
