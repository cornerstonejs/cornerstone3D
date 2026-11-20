import { describe, it, expect } from '@jest/globals';
import {
  mapScalarToViewportVoiIntensity,
  mapViewportVoiIntensityToScalar,
} from '../../src/utilities/viewportVoiIntensityMapping';
import { createVOILUTSampler } from '../../src/utilities/createVOILUTSequenceTransferFunction';

const voiLUT = {
  firstValueMapped: 0,
  numBitsPerEntry: 16,
  lut: [0, 32, 128, 255],
};

describe('viewportVoiIntensityMapping with a VOI LUT Sequence', function () {
  it('gives the same values as the sampler of the curve', () => {
    const voiRange = { lower: 0, upper: 3 };
    const sample = createVOILUTSampler(voiLUT, voiRange);

    for (let value = 0; value <= 3; value++) {
      expect(mapScalarToViewportVoiIntensity(value, { voiRange, voiLUT })).toBe(
        sample(value)
      );
    }
  });

  it('makes one sampler for many values of one curve and one range', () => {
    // createVOILUTSampler reads every entry to get the scale of the entries,
    // and a LUT holds up to 65536 entries. The callers map one voxel for each
    // call over a whole region, so a sampler for each call froze the browser.
    const voiRange = { lower: 0, upper: 3 };
    const large = {
      firstValueMapped: 0,
      numBitsPerEntry: 16,
      lut: new Array(65536).fill(0).map((_, index) => index),
    };
    let reads = 0;
    const counted = new Proxy(large.lut, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) {
          reads++;
        }

        return target[key];
      },
    });
    const props = {
      voiRange,
      voiLUT: { ...large, lut: counted },
    };

    mapScalarToViewportVoiIntensity(0, props);
    const readsAfterFirst = reads;

    for (let value = 1; value < 100; value++) {
      mapScalarToViewportVoiIntensity(value, props);
    }

    // One entry read for each of the 99 later calls, and no second scan
    expect(reads - readsAfterFirst).toBe(99);
  });

  it('rebuilds the sampler when the range changes', () => {
    const first = mapScalarToViewportVoiIntensity(1, {
      voiRange: { lower: 0, upper: 3 },
      voiLUT,
    });
    const second = mapScalarToViewportVoiIntensity(1, {
      voiRange: { lower: 0, upper: 300 },
      voiLUT,
    });

    expect(first).not.toBe(second);
    expect(second).toBe(0);
  });

  it('honors invert in both directions', () => {
    const voiRange = { lower: 0, upper: 3 };
    const props = { voiRange, voiLUT, invert: true };
    const mapped = mapScalarToViewportVoiIntensity(3, props);

    expect(mapped).toBe(0);
    expect(mapViewportVoiIntensityToScalar(mapped, props)).toBe(3);
  });
});
