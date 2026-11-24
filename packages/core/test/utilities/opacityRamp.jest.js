import { describe, it, expect } from '@jest/globals';
import {
  getOpacityRampPoints,
  getOpacityRampValue,
  hasOpacityRamp,
} from '../../src/utilities/opacityRamp';

const MAPPING = [
  { value: 128, opacity: 1 },
  { value: 0, opacity: 0 },
  { value: 224, opacity: 0.5 },
];

/** The alpha of a value by the points of a ramp. */
function alphaAt(ramp, value, range) {
  return getOpacityRampValue(getOpacityRampPoints(ramp, range), value);
}

describe('The opacity rule of every render path: opacity * ramp(value), 0 below the threshold', () => {
  it('scales the points of the mapping, sorted by value, by the opacity', () => {
    expect(
      getOpacityRampPoints({ opacity: 0.5, opacityMapping: MAPPING })
    ).toEqual([
      [0, 0],
      [128, 0.5],
      [224, 0.25],
    ]);
  });

  it('is linear between two points and constant past the first and the last', () => {
    const ramp = { opacity: 0.6, opacityMapping: MAPPING };

    expect(alphaAt(ramp, 64)).toBeCloseTo(0.3, 10);
    expect(alphaAt(ramp, 176)).toBeCloseTo(0.45, 10);
    expect(alphaAt(ramp, -50)).toBe(0);
    expect(alphaAt(ramp, 1000)).toBeCloseTo(0.3, 10);
  });

  it('gives 0 below the threshold and the ramp from the threshold on, not a jump to the next point', () => {
    const ramp = { opacity: 0.6, opacityMapping: MAPPING, threshold: 48 };

    expect(alphaAt(ramp, 32)).toBe(0);
    expect(alphaAt(ramp, 47.7)).toBe(0);
    expect(alphaAt(ramp, 48)).toBeCloseTo(0.6 * (48 / 128), 10);
    expect(alphaAt(ramp, 64)).toBeCloseTo(0.3, 10);
    expect(alphaAt(ramp, 160)).toBeCloseTo(0.5, 10);
  });

  it('is flat over the range of the data without a mapping, with a step at the threshold', () => {
    expect(getOpacityRampPoints({ opacity: 0.4 }, [-1000, 3000])).toEqual([
      [-1000, 0.4],
      [3000, 0.4],
    ]);
    expect(alphaAt({ opacity: 0.6, threshold: 100 }, 99, [0, 224])).toBe(0);
    expect(alphaAt({ opacity: 0.6, threshold: 100 }, 100, [0, 224])).toBe(0.6);
    expect(alphaAt({ opacity: 0.6, threshold: 100 }, 224, [0, 224])).toBe(0.6);
  });

  it('makes everything transparent with a threshold above the data, and opaque with one below', () => {
    expect(alphaAt({ threshold: 500 }, 224, [0, 224])).toBe(0);
    expect(alphaAt({ threshold: -500 }, 0, [0, 224])).toBe(1);
  });

  it('reads a null threshold as none, and an opacity of 1 when none is given', () => {
    expect(getOpacityRampPoints({ threshold: null }, [0, 10])).toEqual([
      [0, 1],
      [10, 1],
    ]);
    expect(hasOpacityRamp({ threshold: null })).toBe(false);
    expect(hasOpacityRamp({ opacityMapping: [] })).toBe(false);
    expect(hasOpacityRamp({ threshold: 0 })).toBe(true);
    expect(hasOpacityRamp({ opacityMapping: MAPPING })).toBe(true);
  });

  it('clamps the opacity and the opacities of the mapping to 0 to 1', () => {
    expect(
      getOpacityRampPoints({
        opacity: 2,
        opacityMapping: [
          { value: 0, opacity: -1 },
          { value: 1, opacity: 3 },
        ],
      })
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});
