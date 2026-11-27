import { describe, it, expect } from '@jest/globals';
import { getViewportVoiMappingForVolume } from '../../../src/utilities/segmentation/growCut/getViewportVoiMappingForVolume';

const voiLUT = { firstValueMapped: 0, numBitsPerEntry: 8, lut: [0, 64, 255] };

function makeViewport(props) {
  return {
    getProperties: () => ({ voiRange: { lower: 0, upper: 2 }, ...props }),
    getCornerstoneImage: () => ({ voiLUT }),
  };
}

describe('getViewportVoiMappingForVolume', () => {
  it('gives the VOI LUT Sequence only when the viewport shows it', () => {
    const mapping = (props) =>
      getViewportVoiMappingForVolume(makeViewport(props)).voiLUT;

    expect(mapping({})).toBe(voiLUT);
    expect(mapping({ useVOILUTSequence: false })).toBeUndefined();
    expect(mapping({ voiLUTFunctionSetByUser: true })).toBeUndefined();
    expect(
      mapping({ voiLUTFunctionSetByUser: true, useVOILUTSequence: true })
    ).toBe(voiLUT);
    expect(mapping({ colormap: { name: 'hsv' } })).toBeUndefined();
  });
});
