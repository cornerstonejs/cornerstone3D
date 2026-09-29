import { isColorImage } from '@cornerstonejs/utils';
import { generateVolumePropsFromImageIds } from '../src/utilities/generateVolumePropsFromImageIds';
import * as metaData from '../src/metaData';

const COLOR = [
  'RGB',
  'PALETTE COLOR',
  'YBR_FULL',
  'YBR_FULL_422',
  'YBR_PARTIAL_422',
  'YBR_PARTIAL_420',
  'YBR_RCT',
  'YBR_ICT',
];
const GRAYSCALE = ['MONOCHROME1', 'MONOCHROME2', '', 'UNKNOWN', undefined];

describe('isColorImage', () => {
  it.each(COLOR)('returns true for %s', (pmi) => {
    expect(isColorImage(pmi)).toBe(true);
  });

  it.each(GRAYSCALE)('returns false for %s', (pmi) => {
    expect(isColorImage(pmi)).toBe(false);
  });
});

describe('generateVolumePropsFromImageIds numberOfComponents', () => {
  let photometricInterpretation;
  const imageIds = ['test:0', 'test:1', 'test:2'];

  const provider = (type, imageId) => {
    const index = Number(imageId.split(':')[1]);
    switch (type) {
      case 'imagePixelModule':
        return {
          photometricInterpretation,
          samplesPerPixel: photometricInterpretation.startsWith('MONO') ? 1 : 3,
          bitsAllocated: 8,
          bitsStored: 8,
          highBit: 7,
          pixelRepresentation: 0,
        };
      case 'generalSeriesModule':
        return { modality: 'OT', seriesInstanceUID: '1.2.3' };
      case 'imagePlaneModule':
        return {
          imageOrientationPatient: [1, 0, 0, 0, 1, 0],
          imagePositionPatient: [0, 0, index],
          pixelSpacing: [1, 1],
          frameOfReferenceUID: '1.2.3.4',
          columns: 4,
          rows: 4,
        };
    }
  };

  beforeAll(() => metaData.addProvider(provider, 10000));
  afterAll(() => metaData.removeProvider(provider));

  it.each([
    ...COLOR.map((pmi) => [pmi, 3]),
    ['MONOCHROME1', 1],
    ['MONOCHROME2', 1],
  ])('%s -> %i components', (pmi, expected) => {
    photometricInterpretation = pmi;
    const props = generateVolumePropsFromImageIds(imageIds, 'volume');
    expect(props.numberOfComponents).toBe(expected);
  });
});
