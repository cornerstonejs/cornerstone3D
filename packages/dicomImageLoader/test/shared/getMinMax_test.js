/* eslint import/extensions: 0 */
import { expect } from 'chai';
import getMinMax from '../../src/shared/getMinMax.js';

describe('#getMinMax', function() {
  it('should return the right min and max values', function() {
    const result = getMinMax([7, 3, 9, 6, 8, 1, 4, 5, 2]);

    expect(result.min).to.be.equal(1);
    expect(result.max).to.be.equal(9);
  });
});
