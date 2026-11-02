import { describe, it, expect, jest } from '@jest/globals';

// Only the derived-labelmap image factory is stubbed, as in the round-trip
// tests; everything else runs for real.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    imageLoader: {
      ...actual.imageLoader,
      createAndCacheDerivedLabelmapImage: (referencedImageId) => {
        const pixelData = new Uint16Array(16);
        return {
          referencedImageId,
          getPixelData: () => pixelData,
          voxelManager: {
            setAtIndex: (index, value) => (pixelData[index] = value),
          },
        };
      },
    },
  };
});

const {
  generateSegmentation,
} = require('../src/adapters/Cornerstone3D/Segmentation/generateSegmentation');
const {
  LABELMAP_SEG_SOP_CLASS_UID,
  makeReferencedStack,
  buildLabelmap3D,
} = require('./helpers/segRoundTrip');

const SLICE_COUNT = 4;

// prettier-ignore
const SHAPE = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
];

const PREDECESSOR_IMAGE_ID = 'ctstack:predecessor';
const PREDECESSOR_SERIES_UID = '1.2.826.0.1.3680043.8.498.900';
const PREDECESSOR_SOP_UID = '1.2.826.0.1.3680043.8.498.901';

// What the PREDECESSOR_SEQUENCE module of referencedMetadataProvider returns:
// the superseded series' own data, the next instance number, and the link back.
const PREDECESSOR = {
  SeriesInstanceUID: PREDECESSOR_SERIES_UID,
  SeriesNumber: '3101',
  SeriesDescription: 'Kidney',
  InstanceNumber: 4,
  PredecessorDocumentsSequence: {
    StudyInstanceUID: '1.2.826.0.1.3680043.8.498.1',
    ReferencedSeriesSequence: {
      SeriesInstanceUID: PREDECESSOR_SERIES_UID,
      ReferencedSOPSequence: {
        ReferencedSOPClassUID: '1.2.840.10008.5.1.4.1.1.66.4',
        ReferencedSOPInstanceUID: PREDECESSOR_SOP_UID,
      },
    },
  },
};

/** The stack's provider, plus the predecessor module the save path asks for. */
function withPredecessor(stack) {
  return {
    get(moduleType, imageId, ...rest) {
      if (moduleType === 'PredecessorSequence') {
        return imageId === PREDECESSOR_IMAGE_ID ? PREDECESSOR : undefined;
      }
      return stack.metadataProvider.get(moduleType, imageId, ...rest);
    },
  };
}

/**
 * Saving on top of an existing series has to reach the DATASET. The adapter
 * returns a wrapper whose `dataset` property holds what gets stored, and both
 * export branches merged the predecessor onto that wrapper: the chosen series,
 * its instance number and the predecessor link never reached the stored object,
 * so every save into an existing series wrote a new series instead.
 */
describe('generateSegmentation predecessor merge', () => {
  const cases = [
    ['bitmap export', undefined],
    ['labelmap export', LABELMAP_SEG_SOP_CLASS_UID],
  ];

  it.each(cases)(
    'applies the predecessor to the dataset (%s)',
    (_name, sopClassUID) => {
      const stack = makeReferencedStack(SLICE_COUNT);
      const labelmap3D = buildLabelmap3D(SLICE_COUNT, { 1: SHAPE });

      const generated = generateSegmentation(
        stack.images,
        labelmap3D,
        withPredecessor(stack),
        { predecessorImageId: PREDECESSOR_IMAGE_ID, sopClassUID }
      );

      const { dataset } = generated;
      expect(dataset.SeriesInstanceUID).toBe(PREDECESSOR_SERIES_UID);
      expect(dataset.SeriesNumber).toBe('3101');
      expect(dataset.InstanceNumber).toBe(4);
      expect(
        dataset.PredecessorDocumentsSequence?.ReferencedSeriesSequence
          ?.ReferencedSOPSequence?.ReferencedSOPInstanceUID
      ).toBe(PREDECESSOR_SOP_UID);
    }
  );

  it.each(cases)('leaves the wrapper alone (%s)', (_name, sopClassUID) => {
    const stack = makeReferencedStack(SLICE_COUNT);
    const labelmap3D = buildLabelmap3D(SLICE_COUNT, { 1: SHAPE });

    const generated = generateSegmentation(
      stack.images,
      labelmap3D,
      withPredecessor(stack),
      { predecessorImageId: PREDECESSOR_IMAGE_ID, sopClassUID }
    );

    // The wrapper is not what gets stored, and it is where these values used
    // to land.
    expect(generated.SeriesInstanceUID).toBeUndefined();
    expect(generated.PredecessorDocumentsSequence).toBeUndefined();
  });

  it('writes a new series when no predecessor is given', () => {
    const stack = makeReferencedStack(SLICE_COUNT);
    const labelmap3D = buildLabelmap3D(SLICE_COUNT, { 1: SHAPE });

    const { dataset } = generateSegmentation(
      stack.images,
      labelmap3D,
      withPredecessor(stack)
    );

    expect(dataset.SeriesInstanceUID).not.toBe(PREDECESSOR_SERIES_UID);
    expect(dataset.PredecessorDocumentsSequence).toBeUndefined();
  });
});
