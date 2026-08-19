import { describe, it, expect } from '@jest/globals';
import createSigmoidRGBTransferFunction from '../../src/utilities/createSigmoidRGBTransferFunction';
import getVoiFromSigmoidRGBTransferFunction from '../../src/utilities/getVoiFromSigmoidRGBTransferFunction';
import invertRgbTransferFunction from '../../src/utilities/invertRgbTransferFunction';

describe('getVoiFromSigmoidRGBTransferFunction', function () {
  it('Should recover the range a sigmoid function was built from', () => {
    const cfun = createSigmoidRGBTransferFunction({ lower: -800, upper: 200 });

    const [lower, upper] = getVoiFromSigmoidRGBTransferFunction(cfun);

    expect(lower).toBeCloseTo(-800, -1);
    expect(upper).toBeCloseTo(200, -1);
  });

  it('Should return the range in order for an inverted sigmoid function', () => {
    const cfun = createSigmoidRGBTransferFunction({ lower: -800, upper: 200 });

    invertRgbTransferFunction(cfun);

    const [lower, upper] = getVoiFromSigmoidRGBTransferFunction(cfun);

    // Without ordering, the window width comes out negative for an inverted
    // function and the range is reversed, which flips a linear function rebuilt
    // from it (see BaseVolumeViewport.setVOI).
    expect(lower).toBeLessThan(upper);
    expect(lower).toBeCloseTo(-800, -1);
    expect(upper).toBeCloseTo(200, -1);
  });
});
