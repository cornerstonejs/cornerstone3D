/* eslint import/extensions: 0 */
import { expect } from 'chai';
import calculateMinMax from '../../src/shared/calculateMinMax.js';

describe('#calculateMinMax', function() {
  beforeEach(function() {
    this.imageFrame = {
      smallestPixelValue: -1,
      largestPixelValue: 10,
      pixelData: [7, 3, 9, 6, 8, 1, 4, 5, 2],
    };
  });

  it('should update the smallest and largest pixel values if strict is false', function() {
    const strict = false;

    calculateMinMax(this.imageFrame, strict);

    expect(this.imageFrame.smallestPixelValue).to.be.equal(1);
    expect(this.imageFrame.largestPixelValue).to.be.equal(9);
  });

  it('should not update the smallest and largest pixel values if strict is true', function() {
    const strict = true;

    calculateMinMax(this.imageFrame, strict);

    expect(this.imageFrame.smallestPixelValue).to.be.equal(-1);
    expect(this.imageFrame.largestPixelValue).to.be.equal(10);
  });

  it('should update the smallest and largest pixel values regardless of strict value', function() {
    let strict = false;

    this.imageFrame.smallestPixelValue = undefined;
    this.imageFrame.largestPixelValue = undefined;

    // ACT
    calculateMinMax(this.imageFrame, strict);

    // ASSERT
    expect(this.imageFrame.smallestPixelValue).to.be.equal(1);
    expect(this.imageFrame.largestPixelValue).to.be.equal(9);

    strict = true;

    this.imageFrame.smallestPixelValue = undefined;
    this.imageFrame.largestPixelValue = undefined;

    // ACT
    calculateMinMax(this.imageFrame, strict);

    // ASSERT
    expect(this.imageFrame.smallestPixelValue).to.be.equal(1);
    expect(this.imageFrame.largestPixelValue).to.be.equal(9);
  });
});
