import { describe, it, expect } from '@jest/globals';
import getModalityLut from '../src/RenderingEngine/helpers/cpuFallback/rendering/getModalityLut';
import generateLut from '../src/RenderingEngine/helpers/cpuFallback/rendering/generateLut';

describe('cpuFallback getModalityLut (non-linear Modality LUT)', () => {
  const modalityLUT = { firstValueMapped: 100, lut: [10, 20, 30] };

  it('maps stored values relative to firstValueMapped', () => {
    const fn = getModalityLut(1, 0, modalityLUT);

    expect(fn(100)).toBe(10);
    expect(fn(101)).toBe(20);
    expect(fn(102)).toBe(30);
  });

  it('clamps values outside the mapped range to the first/last entry', () => {
    const fn = getModalityLut(1, 0, modalityLUT);

    expect(fn(0)).toBe(10);
    expect(fn(99)).toBe(10);
    expect(fn(103)).toBe(30);
    expect(fn(5000)).toBe(30);
  });

  it('still works when firstValueMapped is 0', () => {
    const fn = getModalityLut(1, 0, { firstValueMapped: 0, lut: [7, 8, 9] });

    expect(fn(0)).toBe(7);
    expect(fn(1)).toBe(8);
    expect(fn(2)).toBe(9);
    expect(fn(3)).toBe(9);
  });

  it('supports a negative firstValueMapped (signed stored values)', () => {
    const fn = getModalityLut(1, 0, { firstValueMapped: -2, lut: [1, 2, 3] });

    expect(fn(-3)).toBe(1);
    expect(fn(-2)).toBe(1);
    expect(fn(-1)).toBe(2);
    expect(fn(0)).toBe(3);
    expect(fn(1)).toBe(3);
  });

  it('uses the slope/intercept when no Modality LUT is given', () => {
    const fn = getModalityLut(2, -1, undefined);

    expect(fn(10)).toBe(19);
  });

  it('generateLut applies the Modality LUT at the right offset', () => {
    const image = {
      minPixelValue: 98,
      maxPixelValue: 104,
      slope: 1,
      intercept: 0,
      isPreScaled: false,
    };

    // ww 256 / wc 128 makes the linear VOI LUT the identity for 0..255
    const lut = generateLut(image, 256, 128, false, modalityLUT, undefined);

    // lut is indexed by stored value (minPixelValue >= 0, so no offset);
    // stored values 98..104 -> 10, 10, 10 (=100), 20, 30, 30, 30
    expect(Array.from(lut.slice(98, 105))).toEqual([
      10, 10, 10, 20, 30, 30, 30,
    ]);
  });
});
