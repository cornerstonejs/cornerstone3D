import type { DataSet } from 'dicom-parser';
import unpackBinaryFrame from './unpackBinaryFrame';

/**
 * Function to deal with extracting an image frame from an encapsulated data set.
 */

function getUncompressedImageFrame(
  dataSet: DataSet,
  frameIndex: number
): Uint8Array {
  const pixelDataElement =
    dataSet.elements.x7fe00010 || dataSet.elements.x7fe00008;
  const bitsAllocated = dataSet.uint16('x00280100');
  const rows = dataSet.uint16('x00280010');
  const columns = dataSet.uint16('x00280011');

  let samplesPerPixel = dataSet.uint16('x00280002');

  /**
   * From: http://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.7.6.3.html
   *
   * Though the chrominance channels are downsampled, there are still nominally
   * three channels, hence Samples per Pixel (0028,0002) has a value of 3, not
   * 2. I.e., for pixel data in a Native (uncompressed) format, the Value Length
   * of Pixel Data (7FE0,0010) is not:
   *
   * Rows (0028,0010) * Columns (0028,0011) * Number of Frames (0028,0008) *
   * Samples per Pixel (0028,0002) * (⌊(Bits Allocated (0028,0100)-1)/8⌋+1)
   *
   * padded to an even length, as it would otherwise be, but rather is:
   *
   * Rows (0028,0010) * Columns (0028,0011) * Number of Frames (0028,0008) * 2 *
   * (⌊(Bits Allocated (0028,0100)-1)/8⌋+1)
   *
   * padded to an even length.
   */
  const photometricInterpretation = dataSet.string('x00280004');

  if (photometricInterpretation === 'YBR_FULL_422') {
    samplesPerPixel = 2;
    console.warn(
      `Using SamplesPerPixel of 2 for YBR_FULL_422 photometric interpretation.
      See http://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.7.6.3.html for more information.`
    );
  }

  const pixelDataOffset = pixelDataElement.dataOffset;
  const pixelsPerFrame = rows * columns * samplesPerPixel;

  let frameOffset;

  if (bitsAllocated === 8) {
    frameOffset = pixelDataOffset + frameIndex * pixelsPerFrame;
    if (frameOffset >= dataSet.byteArray.length) {
      throw new Error('frame exceeds size of pixelData');
    }

    return new Uint8Array(
      dataSet.byteArray.buffer.slice(frameOffset, frameOffset + pixelsPerFrame)
    );
  } else if (bitsAllocated === 12) {
    // Packed 12-bit: 2 pixels = 3 bytes
    const bytesPerFrame = Math.ceil((pixelsPerFrame * 12) / 8);
    frameOffset = pixelDataOffset + frameIndex * bytesPerFrame;

    if (frameOffset + bytesPerFrame > dataSet.byteArray.length) {
      throw new Error('frame exceeds size of pixelData');
    }

    const pixelData = new Uint16Array(pixelsPerFrame);
    let byteOffset = frameOffset;
    let pixelIndex = 0;

    while (pixelIndex < pixelsPerFrame) {
      const byte0 = dataSet.byteArray[byteOffset++] || 0;
      const byte1 = dataSet.byteArray[byteOffset++] || 0;
      const byte2 = dataSet.byteArray[byteOffset++] || 0;

      // First pixel: lower 12 bits from bytes 0-1
      // Byte0: bits 0-7, Byte1 bits 0-3 (lower nibble)
      pixelData[pixelIndex++] = byte0 | ((byte1 & 0x0f) << 8);

      // Second pixel: upper 12 bits from bytes 1-2
      // Byte1 bits 4-7 (upper nibble), Byte2: bits 0-7
      if (pixelIndex < pixelsPerFrame) {
        pixelData[pixelIndex++] = (byte1 >> 4) | (byte2 << 4);
      }
    }

    return new Uint8Array(pixelData.buffer);
  } else if (bitsAllocated === 16) {
    frameOffset = pixelDataOffset + frameIndex * pixelsPerFrame * 2;
    if (frameOffset >= dataSet.byteArray.length) {
      throw new Error('frame exceeds size of pixelData');
    }

    return new Uint8Array(
      dataSet.byteArray.buffer.slice(
        frameOffset,
        frameOffset + pixelsPerFrame * 2
      )
    );
  } else if (bitsAllocated === 1) {
    frameOffset = pixelDataOffset + frameIndex * pixelsPerFrame * 0.125;
    if (frameOffset >= dataSet.byteArray.length) {
      throw new Error('frame exceeds size of pixelData');
    }

    return unpackBinaryFrame(dataSet.byteArray, frameOffset, pixelsPerFrame);
  } else if (bitsAllocated === 32) {
    frameOffset = pixelDataOffset + frameIndex * pixelsPerFrame * 4;
    if (frameOffset >= dataSet.byteArray.length) {
      throw new Error('frame exceeds size of pixelData');
    }

    return new Uint8Array(
      dataSet.byteArray.buffer.slice(
        frameOffset,
        frameOffset + pixelsPerFrame * 4
      )
    );
  }

  throw new Error('unsupported pixel format');
}

export default getUncompressedImageFrame;
