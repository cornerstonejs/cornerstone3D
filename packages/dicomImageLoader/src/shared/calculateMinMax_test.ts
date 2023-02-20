import { expect } from 'chai';
import calculateMinMax from './calculateMinMax.js';

describe('#calculateMinMax', () => {
  let imageFrame = {};

  beforeEach(() => {
    imageFrame = {
      smallestPixelValue: -1,
      largestPixelValue: 10,
      pixelData: [7, 3, 9, 6, 8, 1, 4, 5, 2],
    };
  });

  it('should update the smallest and largest pixel values if strict is false', () => {
    const strict = false;

    calculateMinMax(imageFrame, strict);

    expect(imageFrame.smallestPixelValue).to.be.equal(1);
    expect(imageFrame.largestPixelValue).to.be.equal(9);
  });

  it('should not update the smallest and largest pixel values if strict is true', () => {
    const strict = true;

    calculateMinMax(imageFrame, strict);

    expect(imageFrame.smallestPixelValue).to.be.equal(-1);
    expect(imageFrame.largestPixelValue).to.be.equal(10);
  });

  it('should update the smallest and largest pixel values regardless of strict value', () => {
    let strict = false;

    imageFrame.smallestPixelValue = undefined;
    imageFrame.largestPixelValue = undefined;

    // ACT
    calculateMinMax(imageFrame, strict);

    // ASSERT
    expect(imageFrame.smallestPixelValue).to.be.equal(1);
    expect(imageFrame.largestPixelValue).to.be.equal(9);

    strict = true;

    imageFrame.smallestPixelValue = undefined;
    imageFrame.largestPixelValue = undefined;

    // ACT
    calculateMinMax(imageFrame, strict);

    // ASSERT
    expect(imageFrame.smallestPixelValue).to.be.equal(1);
    expect(imageFrame.largestPixelValue).to.be.equal(9);
  });
});
