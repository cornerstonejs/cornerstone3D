import { pixelDataUpdate } from './pixelDataUpdate';

describe('pixelDataUpdate', () => {
  it('normalizes a negative Pixel Padding Range Limit into pixelPaddingRangeLimit', () => {
    const basePixelData = {
      pixelRepresentation: 1,
      pixelPaddingValue: -2000,
      pixelPaddingRangeLimit: -1024,
    };

    const result = pixelDataUpdate(
      () => basePixelData,
      'imageId',
      undefined,
      undefined
    );

    expect(result.pixelPaddingValue).toBe(-2000 & 0xffff);
    expect(result.pixelPaddingRangeLimit).toBe(-1024 & 0xffff);
  });
});
