/* eslint-disable @typescript-eslint/no-explicit-any */
import getUncompressedImageFrame from '../imageLoader/wadouri/getUncompressedImageFrame';
import unpackBinaryFrame from '../imageLoader/wadouri/unpackBinaryFrame';

/**
 * Minimal stand-in for a dicom-parser `DataSet` carrying native 1-bit pixel
 * data. Bits Allocated 1 frames are bit packed back to back with no padding
 * between them (PS3.5 8.1.1), so a frame whose rows * columns is not a
 * multiple of 8 makes the next frame start part way through a byte.
 */
function bitPackedDataSet(
  rows: number,
  columns: number,
  pixelBytes: number[],
  prefixLength = 0
) {
  const byteArray = new Uint8Array(prefixLength + pixelBytes.length);
  byteArray.set(pixelBytes, prefixLength);
  const values: Record<string, unknown> = {
    x00280100: 1,
    x00280010: rows,
    x00280011: columns,
    x00280002: 1,
  };

  return {
    byteArray,
    elements: {
      x7fe00010: { dataOffset: prefixLength, length: pixelBytes.length },
    },
    uint16: (tag: string) => values[tag],
    string: (tag: string) => values[tag],
  };
}

describe('bit packed (Bits Allocated 1) native frames', () => {
  describe('getUncompressedImageFrame', () => {
    it('extracts frames whose pixel count is a multiple of 8', () => {
      // 2x4 = 8 pixels per frame, so every frame starts on a byte boundary.
      const dataSet = bitPackedDataSet(2, 4, [0b00000101, 0b10000000], 6);

      expect(Array.from(getUncompressedImageFrame(dataSet as any, 0))).toEqual([
        1, 0, 1, 0, 0, 0, 0, 0,
      ]);
      expect(Array.from(getUncompressedImageFrame(dataSet as any, 1))).toEqual([
        0, 0, 0, 0, 0, 0, 0, 1,
      ]);
    });

    it('extracts a frame that starts part way through a byte', () => {
      // 3x3 = 9 pixels per frame: frame 0 is bits 0-8, frame 1 is bits 9-17.
      // All 18 bits set -> bytes 0xFF, 0xFF, 0x03.
      const dataSet = bitPackedDataSet(3, 3, [0xff, 0xff, 0x03]);

      expect(Array.from(getUncompressedImageFrame(dataSet as any, 0))).toEqual(
        new Array(9).fill(1)
      );
      expect(Array.from(getUncompressedImageFrame(dataSet as any, 1))).toEqual(
        new Array(9).fill(1)
      );
    });

    it('keeps the bit order of a mid-byte frame after a pixel data offset', () => {
      // 1x3 = 3 pixels per frame, LSB first:
      // byte 0b10_101_011 -> frame 0 = bits 0-2 = 1,1,0
      //                      frame 1 = bits 3-5 = 1,0,1
      //                      frame 2 = bits 6-8 = 0,1 + bit 0 of byte 1
      const dataSet = bitPackedDataSet(1, 3, [0b10101011, 0b00000001], 4);

      expect(Array.from(getUncompressedImageFrame(dataSet as any, 0))).toEqual([
        1, 1, 0,
      ]);
      expect(Array.from(getUncompressedImageFrame(dataSet as any, 1))).toEqual([
        1, 0, 1,
      ]);
      expect(Array.from(getUncompressedImageFrame(dataSet as any, 2))).toEqual([
        0, 1, 1,
      ]);
    });

    it('still throws when the frame starts past the end of the pixel data', () => {
      const dataSet = bitPackedDataSet(3, 3, [0xff, 0xff, 0x03]);

      // Frame 3 starts at bit 27, i.e. byte 3, which does not exist.
      expect(() => getUncompressedImageFrame(dataSet as any, 3)).toThrow(
        'frame exceeds size of pixelData'
      );
    });
  });

  describe('unpackBinaryFrame', () => {
    it('defaults to starting at bit 0 of the frame offset byte', () => {
      const byteArray = new Uint8Array([0xff, 0b00000110]);

      expect(Array.from(unpackBinaryFrame(byteArray as any, 1, 3))).toEqual([
        0, 1, 1,
      ]);
    });

    it('starts at the given bit within the frame offset byte', () => {
      // Start at bit 6 of byte 1: bits 6,7 of 0b01000000 then bits 0,1 of 0b10.
      const byteArray = new Uint8Array([0xff, 0b01000000, 0b00000010]);

      expect(Array.from(unpackBinaryFrame(byteArray as any, 1, 4, 6))).toEqual([
        1, 0, 0, 1,
      ]);
    });
  });
});
