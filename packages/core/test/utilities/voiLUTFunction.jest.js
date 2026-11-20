import { describe, it, expect } from '@jest/globals';
import {
  normalizeVOILUTFunction,
  getValidVOILUTFunction,
} from '../../src/utilities/voiLUTFunction';
import { toWindowLevel, toLowHighRange } from '../../src/utilities/windowLevel';
import getVOIRangeFromWindowLevel from '../../src/utilities/getVOIRangeFromWindowLevel';
import VOILUTFunctionType from '../../src/enums/VOILUTFunctionType';

describe('normalizeVOILUTFunction', function () {
  it('accepts the DICOM defined terms', () => {
    expect(normalizeVOILUTFunction('LINEAR')).toBe(VOILUTFunctionType.LINEAR);
    expect(normalizeVOILUTFunction('LINEAR_EXACT')).toBe(
      VOILUTFunctionType.LINEAR_EXACT
    );
    expect(normalizeVOILUTFunction('SIGMOID')).toBe(
      VOILUTFunctionType.SAMPLED_SIGMOID
    );
  });

  it('accepts a single element array, as DICOMweb JSON provides', () => {
    expect(normalizeVOILUTFunction(['SIGMOID'])).toBe(
      VOILUTFunctionType.SAMPLED_SIGMOID
    );
  });

  it('tolerates CS padding and casing', () => {
    expect(normalizeVOILUTFunction(' sigmoid ')).toBe(
      VOILUTFunctionType.SAMPLED_SIGMOID
    );
    expect(normalizeVOILUTFunction('LINEAR_EXACT\0')).toBe(
      VOILUTFunctionType.LINEAR_EXACT
    );
  });

  it('returns undefined for absent or unknown values', () => {
    expect(normalizeVOILUTFunction(undefined)).toBeUndefined();
    expect(normalizeVOILUTFunction('')).toBeUndefined();
    expect(normalizeVOILUTFunction([])).toBeUndefined();
    expect(normalizeVOILUTFunction('BOGUS')).toBeUndefined();
    // A truncated value, which is what the createImage bug produced
    expect(normalizeVOILUTFunction('S')).toBeUndefined();
  });

  it('falls back to LINEAR rather than throwing on bad metadata', () => {
    expect(getValidVOILUTFunction('S')).toBe(VOILUTFunctionType.LINEAR);
    expect(getValidVOILUTFunction(undefined)).toBe(VOILUTFunctionType.LINEAR);
    expect(getValidVOILUTFunction(42)).toBe(VOILUTFunctionType.LINEAR);
  });
});

describe('windowLevel conversions', function () {
  it('uses the C.11.2.1.2.1 formula for LINEAR', () => {
    expect(toLowHighRange(100, 50)).toEqual({ lower: 0, upper: 99 });
  });

  it('uses the C.11.2.1.3.2 formula for LINEAR_EXACT', () => {
    expect(toLowHighRange(100, 50, VOILUTFunctionType.LINEAR_EXACT)).toEqual({
      lower: 0,
      upper: 100,
    });
  });

  it('carries the window unchanged for SIGMOID', () => {
    // The sigmoid transfer function recovers width/center from the range, so
    // the round trip has to be lossless
    const { lower, upper } = toLowHighRange(
      1500,
      -600,
      VOILUTFunctionType.SAMPLED_SIGMOID
    );
    expect(
      toWindowLevel(lower, upper, VOILUTFunctionType.SAMPLED_SIGMOID)
    ).toEqual({ windowWidth: 1500, windowCenter: -600 });
  });

  it('round trips LINEAR_EXACT', () => {
    const { lower, upper } = toLowHighRange(
      0.5,
      0.25,
      VOILUTFunctionType.LINEAR_EXACT
    );
    expect(
      toWindowLevel(lower, upper, VOILUTFunctionType.LINEAR_EXACT)
    ).toEqual({ windowWidth: 0.5, windowCenter: 0.25 });
  });

  it('does not throw for an unsupported VOI LUT function', () => {
    // cornerstone3D#2844: a malformed 0028,1056 used to throw
    // "Invalid VOI LUT function" from here and break rendering entirely
    expect(() => toLowHighRange(100, 50, 'S')).not.toThrow();
    expect(toLowHighRange(100, 50, 'S')).toEqual(toLowHighRange(100, 50));
  });
});

describe('getVOIRangeFromWindowLevel', function () {
  it('honors the VOI LUT function', () => {
    expect(getVOIRangeFromWindowLevel(100, 50, 'LINEAR_EXACT')).toEqual({
      lower: 0,
      upper: 100,
    });
  });

  it('accepts multi-valued window width/center', () => {
    expect(getVOIRangeFromWindowLevel([100, 200], [50, 60])).toEqual({
      lower: 0,
      upper: 99,
    });
  });

  it('returns undefined when there is no window', () => {
    expect(getVOIRangeFromWindowLevel(undefined, undefined)).toBeUndefined();
  });
});
