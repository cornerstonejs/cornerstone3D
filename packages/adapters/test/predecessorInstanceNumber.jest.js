import { describe, it, expect, jest } from '@jest/globals';

const mockGet = jest.fn();

// The provider reads its inputs through `metaData.get`, and registers itself on
// import; both are stubbed so the module under test can be driven directly.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    metaData: {
      ...actual.metaData,
      get: (...args) => mockGet(...args),
      addProvider: () => undefined,
    },
  };
});

const { Enums } = require('@jest/globals').jest.requireActual(
  '@cornerstonejs/core'
);
const {
  metadataProvider,
} = require('../src/utilities/referencedMetadataProvider');

const { MetadataModules } = Enums;

const IMAGE_ID = 'wadors:predecessor';
const SERIES_UID = '1.2.826.0.1.3680043.8.498.900';
const STUDY_UID = '1.2.826.0.1.3680043.8.498.1';

/** Answers the three modules the predecessor sequence is built from. */
function givenPredecessor({ instanceNumber }) {
  mockGet.mockImplementation((moduleType) => {
    switch (moduleType) {
      case MetadataModules.SERIES_DATA:
        return { SeriesInstanceUID: SERIES_UID, SeriesNumber: '3101' };
      case MetadataModules.GENERAL_IMAGE:
        return {
          instanceNumber,
          sopClassUID: '1.2.840.10008.5.1.4.1.1.66.4',
          sopInstanceUID: '1.2.826.0.1.3680043.8.498.901',
        };
      case MetadataModules.GENERAL_STUDY:
        return { studyInstanceUID: STUDY_UID };
      default:
        return undefined;
    }
  });
}

const predecessorSequence = () =>
  metadataProvider[MetadataModules.PREDECESSOR_SEQUENCE](IMAGE_ID);

describe('PREDECESSOR_SEQUENCE instance number', () => {
  it('increments the number the predecessor carries', () => {
    givenPredecessor({ instanceNumber: '3' });
    expect(predecessorSequence().InstanceNumber).toBe(4);
  });

  it('increments a numeric instance number too', () => {
    givenPredecessor({ instanceNumber: 3 });
    expect(predecessorSequence().InstanceNumber).toBe(4);
  });

  // `1 + Number(undefined)` is NaN, and the viewer stored that. An artifact
  // written back by another system arrives without an instance number, and it
  // has to stay indistinguishable from one of ours.
  it('numbers a revision of an unnumbered predecessor 1, not NaN', () => {
    givenPredecessor({ instanceNumber: undefined });
    expect(predecessorSequence().InstanceNumber).toBe(1);
  });

  it('numbers a revision of a non-numeric instance number 1', () => {
    givenPredecessor({ instanceNumber: 'first' });
    expect(predecessorSequence().InstanceNumber).toBe(1);
  });

  it('still links back to the predecessor when it has no number', () => {
    givenPredecessor({ instanceNumber: undefined });
    const result = predecessorSequence();
    expect(
      result.PredecessorDocumentsSequence.ReferencedSeriesSequence
        .ReferencedSOPSequence.ReferencedSOPInstanceUID
    ).toBe('1.2.826.0.1.3680043.8.498.901');
    expect(result.SeriesInstanceUID).toBe(SERIES_UID);
  });
});
