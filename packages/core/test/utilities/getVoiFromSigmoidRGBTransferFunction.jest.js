import { describe, it, expect } from '@jest/globals';
import createSigmoidRGBTransferFunction from '../../src/utilities/createSigmoidRGBTransferFunction';
import getVoiFromSigmoidRGBTransferFunction from '../../src/utilities/getVoiFromSigmoidRGBTransferFunction';
import invertRgbTransferFunction from '../../src/utilities/invertRgbTransferFunction';

describe('getVoiFromSigmoidRGBTransferFunction', function () {
  it('Should recover the range a sigmoid function was built from', () => {
    const cfun = createSigmoidRGBTransferFunction({ lower: -800, upper: 200 });

    const [lower, upper] = getVoiFromSigmoidRGBTransferFunction(cfun);

    expect(lower).toBe(-800);
    expect(upper).toBe(200);
  });

  it('Should recover a range whose bounds sum to an even number', () => {
    // The window center is a half integer here, so rounding it before
    // converting back to a range would shift the result by one.
    const cfun = createSigmoidRGBTransferFunction({
      lower: -1000,
      upper: 1000,
    });

    const [lower, upper] = getVoiFromSigmoidRGBTransferFunction(cfun);

    expect(lower).toBe(-1000);
    expect(upper).toBe(1000);
  });

  it('Should not drift when the range is round tripped repeatedly', () => {
    let range = { lower: -800, upper: 200 };

    for (let i = 0; i < 50; i++) {
      const cfun = createSigmoidRGBTransferFunction(range);
      const [lower, upper] = getVoiFromSigmoidRGBTransferFunction(cfun);
      range = { lower, upper };
    }

    expect(range).toEqual({ lower: -800, upper: 200 });
  });

  it('Should return the range in order for an inverted sigmoid function', () => {
    const cfun = createSigmoidRGBTransferFunction({ lower: -800, upper: 200 });

    invertRgbTransferFunction(cfun);

    const [lower, upper] = getVoiFromSigmoidRGBTransferFunction(cfun);

    // Without ordering, the window width comes out negative for an inverted
    // function and the range is reversed, which flips a linear function rebuilt
    // from it (see BaseVolumeViewport.setVOI).
    expect(lower).toBeLessThan(upper);
    expect(lower).toBe(-800);
    expect(upper).toBe(200);
  });
});
