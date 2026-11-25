import {
  VOI_RANGE_MIN_EPSILON,
  VOI_RANGE_RELATIVE_EPSILON,
  ensureNonZeroVOIRange,
  getVOIRangeEpsilon,
} from '../../src/utilities/voiRangeGuards';
import createLinearRGBTransferFunction from '../../src/utilities/createLinearRGBTransferFunction';
import { describe, it, expect } from '@jest/globals';

describe('getVOIRangeEpsilon', function () {
  it('Should be relative to the value', () => {
    expect(getVOIRangeEpsilon(1000)).toBeCloseTo(
      1000 * VOI_RANGE_RELATIVE_EPSILON
    );
    expect(getVOIRangeEpsilon(-1000)).toBeCloseTo(
      1000 * VOI_RANGE_RELATIVE_EPSILON
    );
  });

  it('Should never be smaller than the minimum epsilon', () => {
    expect(getVOIRangeEpsilon(0)).toBe(VOI_RANGE_MIN_EPSILON);
    expect(getVOIRangeEpsilon(1e-10)).toBe(VOI_RANGE_MIN_EPSILON);
  });

  it('Should stay below the data range for a near-zero RescaleSlope', () => {
    // PT with slope ~1e-10: pixel values are on the order of 3e-5
    const value = 3e-5;
    expect(getVOIRangeEpsilon(value)).toBeLessThan(value);
    expect(value + getVOIRangeEpsilon(value)).toBeGreaterThan(value);
  });
});

describe('ensureNonZeroVOIRange', function () {
  it('Should return a range with a width unchanged', () => {
    const voiRange = { lower: 0, upper: 100 };
    expect(ensureNonZeroVOIRange(voiRange)).toBe(voiRange);
  });

  it('Should widen a zero-width range', () => {
    const result = ensureNonZeroVOIRange({ lower: 500, upper: 500 });
    expect(result.lower).toBe(500);
    expect(result.upper).toBe(500 + getVOIRangeEpsilon(500));
    expect(result.upper).toBeGreaterThan(result.lower);
  });

  it('Should widen a zero-width range at zero', () => {
    const result = ensureNonZeroVOIRange({ lower: 0, upper: 0 });
    expect(result).toEqual({ lower: 0, upper: VOI_RANGE_MIN_EPSILON });
  });

  it('Should fix an inverted range', () => {
    const result = ensureNonZeroVOIRange({ lower: 10, upper: 5 });
    expect(result.lower).toBe(10);
    expect(result.upper).toBeGreaterThan(10);
  });

  it('Should keep other properties of the range', () => {
    const result = ensureNonZeroVOIRange({ lower: 1, upper: 1, extra: 'x' });
    expect(result.extra).toBe('x');
  });

  it('Should not mutate the input', () => {
    const voiRange = { lower: 1, upper: 1 };
    ensureNonZeroVOIRange(voiRange);
    expect(voiRange).toEqual({ lower: 1, upper: 1 });
  });

  it('Should handle an empty object input gracefully', () => {
    const result = ensureNonZeroVOIRange({});
    expect(result).toBeDefined();
  });

  it('Should handle NaN or missing properties', () => {
    const result = ensureNonZeroVOIRange({ lower: NaN, upper: NaN });
    expect(Number.isNaN(result.lower)).toBe(true);
  });
});

describe('createLinearRGBTransferFunction', function () {
  // Node value layout: [x, r, g, b, midpoint, sharpness]
  const getNodeRGB = (cfun, index) => {
    const node = [];
    cfun.getNodeValue(index, node);
    return node.slice(1, 4);
  };

  it('Should map lower to black and upper to white', () => {
    const cfun = createLinearRGBTransferFunction({ lower: 0, upper: 100 });
    expect(cfun.getSize()).toBe(2);
    expect(cfun.getRange()).toEqual([0, 100]);
    expect(getNodeRGB(cfun, 0)).toEqual([0, 0, 0]);
    expect(getNodeRGB(cfun, 1)).toEqual([1, 1, 1]);
  });

  it('Should use the default range when the VOI range is not set', () => {
    const cfun = createLinearRGBTransferFunction({});
    expect(cfun.getRange()).toEqual([0, 1024]);
  });

  it('Should keep both points for a zero-width range', () => {
    const cfun = createLinearRGBTransferFunction({ lower: 500, upper: 500 });
    expect(cfun.getSize()).toBe(2);
    const [lower, upper] = cfun.getRange();
    expect(lower).toBe(500);
    expect(upper).toBe(500 + getVOIRangeEpsilon(500));
    expect(getNodeRGB(cfun, 0)).toEqual([0, 0, 0]);
    expect(getNodeRGB(cfun, 1)).toEqual([1, 1, 1]);
  });

  it('Should keep both points for a near-zero RescaleSlope range', () => {
    const value = 3e-5;
    const cfun = createLinearRGBTransferFunction({
      lower: value,
      upper: value,
    });
    expect(cfun.getSize()).toBe(2);
    const [lower, upper] = cfun.getRange();
    expect(lower).toBe(value);
    expect(upper).toBeGreaterThan(value);
  });

  it('Should keep both points for an inverted range', () => {
    const cfun = createLinearRGBTransferFunction({ lower: 10, upper: 5 });
    expect(cfun.getSize()).toBe(2);
    const [lower, upper] = cfun.getRange();
    expect(lower).toBe(10);
    expect(upper).toBeGreaterThan(10);
  });

  it('Should use default values when an empty object is provided', () => {
    const cfun = createLinearRGBTransferFunction({});
    expect(cfun.getSize()).toBe(2);
    expect(cfun.getRange()).toEqual([0, 1024]);
  });

  it('Should handle partial ranges where lower or upper is undefined', () => {
    const cfunOnlyLower = createLinearRGBTransferFunction({ lower: 100 });
    expect(cfunOnlyLower.getSize()).toBe(2);

    const cfunOnlyUpper = createLinearRGBTransferFunction({ upper: 500 });
    expect(cfunOnlyUpper.getSize()).toBe(2);
  });
});
