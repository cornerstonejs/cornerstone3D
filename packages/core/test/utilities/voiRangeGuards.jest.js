import {
  VOI_RANGE_MIN_EPSILON,
  ensureNonZeroVOIRange,
  getVOIRangeEpsilon,
} from '../../src/utilities/voiRangeGuards';
import createLinearRGBTransferFunction from '../../src/utilities/createLinearRGBTransferFunction';
import { toLowHighRange } from '../../src/utilities/windowLevel';
import { describe, it, expect } from '@jest/globals';

function nodeXs(cfun) {
  const xs = [];
  for (let i = 0; i < cfun.getSize(); i++) {
    const node = [];
    cfun.getNodeValue(i, node);
    xs.push(node[0]);
  }
  return xs;
}

function grayAt(cfun, x) {
  const rgb = [];
  cfun.getColor(x, rgb);
  return rgb[0];
}

describe('ensureNonZeroVOIRange', () => {
  it('widens a zero-width range by a relative epsilon with a floor', () => {
    expect(getVOIRangeEpsilon(-1000)).toBeCloseTo(1e-3);
    expect(getVOIRangeEpsilon(0)).toBe(VOI_RANGE_MIN_EPSILON);

    const voiRange = { lower: 500, upper: 500, extra: 'x' };
    expect(ensureNonZeroVOIRange(voiRange)).toEqual({
      lower: 500,
      upper: 500 + getVOIRangeEpsilon(500),
      extra: 'x',
    });
    expect(voiRange.upper).toBe(500);
  });

  it('returns a range with a width, or an inverted range, unchanged', () => {
    for (const voiRange of [
      { lower: 0, upper: 100 },
      { lower: 10, upper: 5 },
    ]) {
      expect(ensureNonZeroVOIRange(voiRange)).toBe(voiRange);
    }
  });
});

describe('createLinearRGBTransferFunction', () => {
  it('maps lower to black and upper to white, and defaults to [0, 1024]', () => {
    const cfun = createLinearRGBTransferFunction({ lower: 10, upper: 50 });
    expect(nodeXs(cfun)).toEqual([10, 50]);
    expect(grayAt(cfun, 10)).toBe(0);
    expect(grayAt(cfun, 50)).toBe(1);

    expect(nodeXs(createLinearRGBTransferFunction({}))).toEqual([0, 1024]);
  });

  // A zero-width window: a value at or below the window renders black, and
  // the next possible pixel value renders white.
  it.each([
    [0, 1],
    [-1024, -1023],
    // PT with a RescaleSlope of 1e-10
    [3e-5, 3e-5 + 1e-10],
  ])('renders %p black and the next value %p white', (value, next) => {
    const cfun = createLinearRGBTransferFunction({
      lower: value,
      upper: value,
    });
    expect(cfun.getSize()).toBe(2);
    expect(grayAt(cfun, value)).toBe(0);
    expect(grayAt(cfun, next)).toBe(1);
  });

  it('keeps an inverted range as an inverted ramp', () => {
    const cfun = createLinearRGBTransferFunction({ lower: 10, upper: 5 });
    expect(grayAt(cfun, 5)).toBe(1);
    expect(grayAt(cfun, 10)).toBe(0);
  });

  // From #3046 (ZoliQua): a zero-width range used to leave one node, and a
  // later setRange gave NaN node positions. See #2733.
  it('rescales to a later, valid range after a zero-width one', () => {
    // WC 0.5 / WW 1, as on the all-zero padding frame of the cine in #2733.
    const degenerate = toLowHighRange(1, 0.5);
    expect(degenerate).toEqual({ lower: 0, upper: 0 });
    const cfun = createLinearRGBTransferFunction(degenerate);

    cfun.setRange(0, 255);

    const xs = nodeXs(cfun);
    expect(xs.every(Number.isFinite)).toBe(true);
    expect(xs[0]).toBeCloseTo(0, 6);
    expect(xs[1]).toBeCloseTo(255, 6);
    expect(grayAt(cfun, 127.5)).toBeCloseTo(0.5);
  });
});
