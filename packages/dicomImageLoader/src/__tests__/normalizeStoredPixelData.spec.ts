import type { Types } from '@cornerstonejs/core';
import normalizeStoredPixelData from '../shared/normalizeStoredPixelData';

function createImageFrame(
  pixelData: Types.PixelDataTypedArray,
  overrides: Partial<Types.IImageFrame> = {}
): Types.IImageFrame {
  return {
    bitsAllocated: 16,
    bitsStored: 14,
    highBit: 13,
    pixelRepresentation: 0,
    pixelData,
    ...overrides,
  } as Types.IImageFrame;
}

describe('normalizeStoredPixelData', () => {
  it('removes unused upper bits from unsigned pixels', () => {
    const imageFrame = createImageFrame(new Uint16Array([32768, 41249, 65343]));

    normalizeStoredPixelData(imageFrame);

    expect(imageFrame.pixelData).toEqual(new Uint16Array([0, 8481, 16191]));
  });

  it('sign extends signed stored pixels', () => {
    const imageFrame = createImageFrame(
      new Int16Array([0x3fff, 0x2000, 0x1fff]),
      { pixelRepresentation: 1 }
    );

    normalizeStoredPixelData(imageFrame);

    expect(imageFrame.pixelData).toEqual(new Int16Array([-1, -8192, 8191]));
  });

  it('uses HighBit to extract a shifted stored field', () => {
    const imageFrame = createImageFrame(new Uint16Array([0xfff8, 0x4000]), {
      bitsStored: 12,
      highBit: 14,
    });

    normalizeStoredPixelData(imageFrame);

    expect(imageFrame.pixelData).toEqual(new Uint16Array([4095, 2048]));
  });

  it('leaves pixels unchanged when all allocated bits are stored', () => {
    const imageFrame = createImageFrame(new Uint16Array([0, 41249, 65535]), {
      bitsStored: 16,
      highBit: 15,
    });

    normalizeStoredPixelData(imageFrame);

    expect(imageFrame.pixelData).toEqual(new Uint16Array([0, 41249, 65535]));
  });
});
