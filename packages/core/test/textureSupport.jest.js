import { describe, it, expect } from '@jest/globals';
import {
  buildProbeSamples,
  decodeProbePixels,
  evaluateProbeSamples,
  getFormatSupportFromProbes,
  getLinearTolerance,
  getNearestTolerance,
  getReadbackScale,
  getSignedNorm16Value,
} from '../src/utilities/textureSupport';

const READBACK_OFFSET = 2 ** 23;

function encodePixels(values, scale) {
  const pixels = new Uint8Array(values.length * 4);

  values.forEach((value, index) => {
    const encoded = Math.round(value * scale + READBACK_OFFSET);

    pixels[index * 4] = (encoded >> 16) & 255;
    pixels[index * 4 + 1] = (encoded >> 8) & 255;
    pixels[index * 4 + 2] = encoded & 255;
    pixels[index * 4 + 3] = 255;
  });

  return pixels;
}

function signedSamples(values, blends, linear) {
  return buildProbeSamples({
    values,
    blends,
    linear,
    toTextureValue: getSignedNorm16Value,
    formatStep: () => 1,
    readbackResolution: 1 / 128,
  });
}

function probe(internalFormat, filter, passed) {
  return {
    internalFormat,
    filter,
    available: true,
    passed,
    maxError: 0,
    failedSamples: 0,
    sampleCount: 1,
    values: [],
  };
}

describe('textureSupport decision logic', () => {
  it('reads -32768 in R16_SNORM as -32767, as the GL specification converts it', () => {
    expect(getSignedNorm16Value(-32768)).toBe(-32767);
    expect(getSignedNorm16Value(-32767)).toBe(-32767);
    expect(getSignedNorm16Value(32767)).toBe(32767);
  });

  it('accepts -32767 and -32768 for -32768 and nothing further away', () => {
    const samples = signedSamples([-32768], [], false);

    expect(samples[0].expected).toBe(-32767);
    expect(samples[0].alsoAccepted).toBe(-32768);
    expect(evaluateProbeSamples(samples, [-32767]).passed).toBe(true);
    expect(evaluateProbeSamples(samples, [-32768]).passed).toBe(true);
    expect(evaluateProbeSamples(samples, [-32766]).passed).toBe(false);
  });

  it('fails a value that is one step of a 16-bit format off', () => {
    const samples = signedSamples([1000, 1001], [], false);

    expect(evaluateProbeSamples(samples, [1000, 1001]).passed).toBe(true);
    expect(evaluateProbeSamples(samples, [1000, 1002]).passed).toBe(false);
    expect(evaluateProbeSamples(samples, [1000.4, 1001]).passed).toBe(true);
  });

  it('fails a device that keeps only 8 bits of a 16-bit value', () => {
    const values = [-32768, 32767, -1024, 3071, 1000, 1001];
    const samples = signedSamples(values, [[4, 5]], true);
    const eightBit = samples.map(
      (sample) => Math.round(sample.expected / 256) * 256
    );
    const result = evaluateProbeSamples(samples, eightBit);

    expect(result.passed).toBe(false);
    expect(result.maxError).toBeGreaterThan(1);
    expect(result.firstFailure).toBeDefined();
  });

  it('fails a device that scales by 32768 in place of 32767', () => {
    const samples = signedSamples([1000, 32767], [], false);

    expect(
      evaluateProbeSamples(
        samples,
        samples.map((sample) => (sample.expected * 32767) / 32768)
      ).passed
    ).toBe(false);
  });

  it('allows a linear blend one 256th of the difference plus one step off', () => {
    expect(getLinearTolerance(1000, 1001, 1, 0)).toBeCloseTo(1 + 1 / 256);
    expect(getLinearTolerance(-32767, 32767, 1, 0)).toBeCloseTo(
      65534 / 256 + 1
    );

    const samples = signedSamples([1000, 1001], [[0, 1]], true);
    const blends = samples.slice(2);

    expect(blends.map((sample) => sample.expected)).toEqual([
      1000.25, 1000.5, 1000.75,
    ]);
    expect(blends.map((sample) => sample.position)).toEqual([0.75, 1, 1.25]);
    expect(
      evaluateProbeSamples(blends, [1000.25, 1000.5, 1000.75]).passed
    ).toBe(true);
    expect(evaluateProbeSamples(blends, [1000, 1001, 1001]).passed).toBe(true);
    expect(evaluateProbeSamples(blends, [1003, 1000.5, 1000.75]).passed).toBe(
      false
    );
  });

  it('reads only the texel centres without linear filtering', () => {
    expect(signedSamples([1, 2, 3], [[0, 1]], false)).toHaveLength(3);
    expect(signedSamples([1, 2, 3], [[0, 1]], true)).toHaveLength(6);
  });

  it('uses half a step of the format, or the readback resolution, at a texel centre', () => {
    expect(getNearestTolerance(1, 1 / 128)).toBe(0.5);
    expect(getNearestTolerance(2 ** -20, 1 / 128)).toBe(1 / 64);
  });

  it('keeps the readback inside 24 bits', () => {
    [32768, 65535, 61440, 2048, 1].forEach((maxAbs) => {
      const scale = getReadbackScale(maxAbs);

      expect(maxAbs * scale + READBACK_OFFSET).toBeLessThan(2 ** 24);
      expect(READBACK_OFFSET - maxAbs * scale).toBeGreaterThanOrEqual(0);
      expect(maxAbs * scale * 2).toBeGreaterThan(READBACK_OFFSET - 1);
    });
    expect(getReadbackScale(32768)).toBe(128);
    expect(getReadbackScale(65535)).toBe(128);
  });

  it('decodes the 24-bit readback and marks pixels that were not drawn', () => {
    const values = [-32767, 0, 1000.5, 65535];
    const pixels = encodePixels(values, 128);

    expect(decodeProbePixels(pixels, 4, 128)).toEqual(values);

    pixels[7] = 0;

    const decoded = decodeProbePixels(pixels, 4, 128);

    expect(decoded[1]).toBeNaN();
    expect(
      evaluateProbeSamples(signedSamples([-32767, 0], [], false), decoded)
        .passed
    ).toBe(false);
  });

  it('fails a black pixel, which the old probe also failed', () => {
    const decoded = decodeProbePixels(new Uint8Array(4), 1, 128);
    const result = evaluateProbeSamples(
      signedSamples([1000], [], false),
      decoded
    );

    expect(result.passed).toBe(false);
    expect(result.maxError).toBe(Infinity);
  });

  it('needs both R16_SNORM and R16 for the norm16 flags', () => {
    const all = [
      probe('R16_SNORM', 'nearest', true),
      probe('R16_SNORM', 'linear', true),
      probe('R16', 'nearest', true),
      probe('R16', 'linear', false),
      probe('R32F', 'nearest', true),
      probe('R32F', 'linear', true),
      probe('R16F', 'nearest', true),
      probe('R16F', 'linear', false),
    ];

    expect(getFormatSupportFromProbes(all)).toEqual({
      norm16: true,
      norm16Linear: false,
      float: true,
      floatLinear: true,
      halfFloat: true,
      halfFloatLinear: false,
    });
  });
});
