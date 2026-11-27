import { describe, it, expect } from '@jest/globals';
import { getPreScaledVOIFunction } from '../../src/RenderingEngine/helpers/cpuFallback/rendering/renderGrayscaleImage';
import { getColormapLut } from '../../src/RenderingEngine/helpers/cpuFallback/rendering/renderPseudoColorImage';
import VOILUTFunctionType from '../../src/enums/VOILUTFunctionType';

const ptViewport = (voiLUTFunction, extra = {}) => ({
  modality: 'PT',
  invert: false,
  voi: { windowWidth: 10, windowCenter: 5, voiLUTFunction },
  ...extra,
});

describe('cpuFallback prescaled PT mapping', () => {
  it('draws SIGMOID as a sigmoid, not as a linear ramp', () => {
    const fn = getPreScaledVOIFunction(
      ptViewport(VOILUTFunctionType.SAMPLED_SIGMOID)
    );

    // 255 / (1 + exp(-4 * (x - c) / w)): mid grey at the center, never 0 or 255
    expect(fn(5)).toBeCloseTo(127.5, 5);
    expect(fn(7.5)).toBeCloseTo(255 / (1 + Math.exp(-1)), 5);
    expect(fn(0)).toBeGreaterThan(0);
  });

  it('uses the exact bounds for LINEAR_EXACT and the LINEAR ramp otherwise', () => {
    const exact = getPreScaledVOIFunction(
      ptViewport(VOILUTFunctionType.LINEAR_EXACT)
    );
    expect(exact(0)).toBe(0);
    expect(exact(10)).toBe(255);
    expect(exact(2.5)).toBeCloseTo(63.75, 5);

    // LINEAR: the affine ramp over c - 0.5 -/+ (w - 1) / 2, as before
    const linear = getPreScaledVOIFunction(ptViewport(undefined));
    expect(linear(0)).toBe(0);
    expect(linear(9)).toBe(255);
    expect(linear(4.5)).toBeCloseTo(127.5, 5);
  });

  it('inverts the curve', () => {
    const fn = getPreScaledVOIFunction(
      ptViewport(VOILUTFunctionType.LINEAR_EXACT, { invert: true })
    );
    expect(fn(0)).toBe(255);
    expect(fn(10)).toBe(0);
  });
});

describe('cpuFallback colormap LUT', () => {
  const image = () => ({
    minPixelValue: 0,
    maxPixelValue: 9,
    slope: 1,
    intercept: 0,
    isPreScaled: true,
  });

  it('drops the VOI LUT Sequence and the sigmoid, as the GPU does', () => {
    const voiLUT = { firstValueMapped: 0, numBitsPerEntry: 8, lut: [255, 0] };
    const linear = Array.from(
      getColormapLut(image(), ptViewport(undefined), false)
    );
    const withCurves = getColormapLut(
      image(),
      ptViewport(VOILUTFunctionType.SAMPLED_SIGMOID, { voiLUT }),
      false
    );

    expect(Array.from(withCurves)).toEqual(linear);
  });
});
