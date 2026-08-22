import { describe, it, expect } from '@jest/globals';
import getVOILUT from '../../src/RenderingEngine/helpers/cpuFallback/rendering/getVOILut';
import createVOILUTSequenceTransferFunction, {
  isRenderableVOILUT,
  getVOILUTSequenceRange,
} from '../../src/utilities/createVOILUTSequenceTransferFunction';
import createLinearRGBTransferFunction from '../../src/utilities/createLinearRGBTransferFunction';
import VOILUTFunctionType from '../../src/enums/VOILUTFunctionType';

describe('cpuFallback getVOILut', function () {
  it('maps the window center to mid grey for LINEAR', () => {
    const fn = getVOILUT(256, 128);

    expect(fn(128)).toBeCloseTo(128, 0);
    expect(fn(0)).toBe(0);
    expect(fn(255)).toBe(255);
  });

  it('does not divide by zero for a width of 1', () => {
    const fn = getVOILUT(1, 128);

    expect(Number.isFinite(fn(127))).toBe(true);
    expect(fn(127)).toBe(0);
    expect(fn(129)).toBe(255);
  });

  it('treats a width of 1 as the C.11.2.1.2.1 threshold', () => {
    // y = ymin for x <= c - 0.5, ymax above it. A fractional center puts a
    // stored value exactly on the threshold, which the continuous form mapped
    // to the middle of the display range instead of to ymin
    const fn = getVOILUT(1, 128.5);

    expect(fn(128)).toBe(0);
    expect(fn(129)).toBe(255);
  });

  it('applies the LINEAR_EXACT formula', () => {
    const fn = getVOILUT(100, 50, undefined, VOILUTFunctionType.LINEAR_EXACT);

    // ((x - c) / w + 0.5) * 255
    expect(fn(50)).toBeCloseTo(127.5, 5);
    expect(fn(0)).toBe(0);
    expect(fn(100)).toBe(255);
    // LINEAR would put the same input half a pixel off
    expect(fn(50)).not.toBe(getVOILUT(100, 50)(50));
  });

  it('applies the SIGMOID formula', () => {
    const fn = getVOILUT(
      100,
      50,
      undefined,
      VOILUTFunctionType.SAMPLED_SIGMOID
    );

    expect(fn(50)).toBeCloseTo(127.5, 5);
    // 255 / (1 + exp(-4 * (100 - 50) / 100))
    expect(fn(100)).toBeCloseTo(255 / (1 + Math.exp(-2)), 5);
    // Asymptotic - never clips, never leaves the range
    expect(fn(-100000)).toBeGreaterThanOrEqual(0);
    expect(fn(100000)).toBeLessThanOrEqual(255);
  });

  it('falls back to LINEAR for an unsupported function', () => {
    const fn = getVOILUT(256, 128, undefined, 'S');

    expect(fn(128)).toBe(getVOILUT(256, 128)(128));
  });

  it('prefers a VOI LUT Sequence over the window', () => {
    const voiLUT = {
      firstValueMapped: 0,
      numBitsPerEntry: 8,
      lut: [0, 64, 128, 255],
    };
    // The window of the own domain of the LUT (0 .. 3) gives the curve of the
    // file without a change
    const fn = getVOILUT(4, 2, voiLUT, VOILUTFunctionType.SAMPLED_SIGMOID);

    expect(fn(0)).toBe(0);
    expect(fn(1)).toBe(64);
    expect(fn(3)).toBe(255);
    // Values below/above the mapped range clamp to the first/last entry
    expect(fn(-10)).toBe(0);
    expect(fn(10)).toBe(255);
  });

  it('stretches a VOI LUT Sequence over the window', () => {
    // The GPU path stretches the curve over the range, so window level
    // reshapes it. The CPU path used the index of the entry directly, so a
    // window level drag did nothing for the same file
    const voiLUT = {
      firstValueMapped: 0,
      numBitsPerEntry: 8,
      lut: [0, 64, 128, 255],
    };
    const fn = getVOILUT(7, 3.5, voiLUT, VOILUTFunctionType.LINEAR);

    // The window 0 .. 6 is two times the domain of the LUT. Thus the middle of
    // the window gives the middle of the curve.
    expect(fn(0)).toBe(0);
    expect(fn(3)).toBe(128);
    expect(fn(6)).toBe(255);
  });

  it('uses the full display range for a LUT of small entries', () => {
    // The number of bits comes from the largest entry, and a shift of the
    // entries gave 0 for every entry of a LUT whose largest entry is below 128
    const voiLUT = {
      firstValueMapped: 0,
      numBitsPerEntry: 16,
      lut: [0, 50, 100],
    };
    const fn = getVOILUT(3, 1.5, voiLUT, VOILUTFunctionType.LINEAR);

    // 7 bits hold 100, so the entries are scaled by 127
    expect(fn(0)).toBe(0);
    expect(fn(2)).toBeCloseTo((100 / 127) * 255, 5);
  });
});

describe('createLinearRGBTransferFunction', function () {
  it('places the two nodes at the window ends', () => {
    const cfun = createLinearRGBTransferFunction({ lower: 0, upper: 255 });

    expect(cfun.getRange()).toEqual([0, 255]);
  });

  it('separates the nodes of a zero width window', () => {
    // A window width of 1 collapses both ends onto one value. Coincident nodes
    // make every later setRange divide by zero, so the function would stay a
    // step function forever (cornerstone3D#2733).
    const cfun = createLinearRGBTransferFunction({ lower: 128, upper: 128 });
    const [lower, upper] = cfun.getRange();

    expect(upper).toBeGreaterThan(lower);
    // Still a threshold at the requested value
    expect((lower + upper) / 2).toBeCloseTo(128, 6);

    // And the range can still be moved afterwards
    cfun.setMappingRange(0, 255);
    expect(cfun.getRange()).toEqual([0, 255]);
  });
});

describe('createVOILUTSequenceTransferFunction', function () {
  const voiLUT = {
    firstValueMapped: 10,
    numBitsPerEntry: 8,
    lut: [0, 32, 64, 128, 255],
  };

  it('recognizes a renderable VOI LUT Sequence', () => {
    expect(isRenderableVOILUT(voiLUT)).toBe(true);
    expect(isRenderableVOILUT(undefined)).toBe(false);
    expect(isRenderableVOILUT({ lut: [] })).toBe(false);
    // Missing LUT Descriptor first value mapped
    expect(isRenderableVOILUT({ lut: [1, 2, 3] })).toBe(false);
  });

  it('reports the LUT input domain', () => {
    expect(getVOILUTSequenceRange(voiLUT)).toEqual({ lower: 10, upper: 14 });
  });

  it('maps stored values through the LUT entries', () => {
    const cfun = createVOILUTSequenceTransferFunction(voiLUT);

    expect(cfun).toBeDefined();

    const rgb = [0, 0, 0];

    cfun.getColor(10, rgb);
    expect(rgb[0]).toBeCloseTo(0, 3);

    cfun.getColor(14, rgb);
    expect(rgb[0]).toBeCloseTo(1, 3);

    cfun.getColor(12, rgb);
    expect(rgb[0]).toBeCloseTo(64 / 255, 2);

    // Outside the mapped range the ends are held, as DICOM requires
    cfun.getColor(-100, rgb);
    expect(rgb[0]).toBeCloseTo(0, 3);
    cfun.getColor(1000, rgb);
    expect(rgb[0]).toBeCloseTo(1, 3);
  });

  it('stretches the curve over a requested range, preserving its shape', () => {
    // Window level hands a new range in; the file's curve must be reshaped over
    // it rather than replaced by a linear ramp
    const cfun = createVOILUTSequenceTransferFunction(voiLUT, {
      voiRange: { lower: 100, upper: 200 },
    });
    const rgb = [0, 0, 0];

    cfun.getColor(100, rgb);
    expect(rgb[0]).toBeCloseTo(0, 3);

    cfun.getColor(200, rgb);
    expect(rgb[0]).toBeCloseTo(1, 3);

    // Entry 2 of 5 sits at the middle of the stretched domain and keeps its value
    cfun.getColor(150, rgb);
    expect(rgb[0]).toBeCloseTo(64 / 255, 2);
  });

  it('ignores a degenerate requested range', () => {
    const cfun = createVOILUTSequenceTransferFunction(voiLUT, {
      voiRange: { lower: 5, upper: 5 },
    });
    const rgb = [0, 0, 0];

    // Falls back to the LUT's own domain instead of collapsing every node
    cfun.getColor(14, rgb);
    expect(rgb[0]).toBeCloseTo(1, 3);
  });

  it('decimates very large LUTs to a bounded number of nodes', () => {
    const lut = Array.from({ length: 16384 }, (_, i) => i * 4);
    const cfun = createVOILUTSequenceTransferFunction(
      { firstValueMapped: 0, numBitsPerEntry: 16, lut },
      { maxNodes: 256 }
    );

    expect(cfun.getSize()).toBeLessThanOrEqual(257);

    const rgb = [0, 0, 0];
    cfun.getColor(16383, rgb);
    expect(rgb[0]).toBeCloseTo(1, 2);
  });

  it('keeps a step transition that falls between sampled entries', () => {
    // A threshold LUT whose step sits well inside a skipped span: with plain
    // every-nth-entry sampling the transition was ramped across the whole span
    // and landed up to `step` entries away from where the file put it
    const length = 4096;
    const stepIndex = 1000;
    const lut = Array.from({ length }, (_, i) => (i < stepIndex ? 0 : 4095));
    const cfun = createVOILUTSequenceTransferFunction(
      { firstValueMapped: 0, numBitsPerEntry: 12, lut },
      { maxNodes: 64 }
    );
    const rgb = [0, 0, 0];

    // Still black one entry below the step and white at it
    cfun.getColor(stepIndex - 1, rgb);
    expect(rgb[0]).toBeCloseTo(0, 2);

    cfun.getColor(stepIndex, rgb);
    expect(rgb[0]).toBeCloseTo(1, 2);

    // The endpoints of the LUT domain stay exact
    cfun.getColor(0, rgb);
    expect(rgb[0]).toBeCloseTo(0, 3);
    cfun.getColor(length - 1, rgb);
    expect(rgb[0]).toBeCloseTo(1, 3);
  });

  it('returns undefined for a LUT it cannot use', () => {
    expect(createVOILUTSequenceTransferFunction(undefined)).toBeUndefined();
    expect(
      createVOILUTSequenceTransferFunction({
        firstValueMapped: 0,
        lut: [0, 0, 0],
      })
    ).toBeUndefined();
  });
});
