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
function givenPredecessor({ instanceNumber, seriesData, generalImage, study }) {
  mockGet.mockImplementation((moduleType) => {
    switch (moduleType) {
      case MetadataModules.SERIES_DATA:
        return seriesData === undefined
          ? { SeriesInstanceUID: SERIES_UID, SeriesNumber: '3101' }
          : seriesData;
      case MetadataModules.GENERAL_IMAGE:
        return generalImage === undefined
          ? {
              instanceNumber,
              sopClassUID: '1.2.840.10008.5.1.4.1.1.66.4',
              sopInstanceUID: '1.2.826.0.1.3680043.8.498.901',
            }
          : generalImage;
      case MetadataModules.GENERAL_STUDY:
        return study === undefined ? { studyInstanceUID: STUDY_UID } : study;
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

describe('PREDECESSOR_SEQUENCE with a predecessor no provider holds', () => {
  // Reading `generalImage.instanceNumber` off `undefined` threw a TypeError,
  // and the throw took the whole save with it. A stale imageId reaches this.
  it('answers undefined when no provider holds the instance', () => {
    givenPredecessor({ generalImage: undefined, instanceNumber: '3' });
    mockGet.mockImplementation((moduleType) =>
      moduleType === MetadataModules.GENERAL_IMAGE ? undefined : {}
    );
    expect(predecessorSequence()).toBeUndefined();
  });

  it('answers undefined when the instance names no SOP Instance UID', () => {
    givenPredecessor({ generalImage: { instanceNumber: '3' } });
    expect(predecessorSequence()).toBeUndefined();
  });

  // Every consumer merges the result with `Object.assign`, so an answer of
  // undefined has to be a no-op rather than a crash.
  it('leaves a dataset untouched when it answers undefined', () => {
    givenPredecessor({ generalImage: {} });
    const dataset = { SeriesNumber: '3100', Modality: 'SEG' };

    Object.assign(dataset, predecessorSequence());

    expect(dataset).toEqual({ SeriesNumber: '3100', Modality: 'SEG' });
  });

  it('does not throw when the study module is absent', () => {
    givenPredecessor({ instanceNumber: '3', study: null });
    expect(
      predecessorSequence().PredecessorDocumentsSequence.StudyInstanceUID
    ).toBeUndefined();
  });
});

describe('PREDECESSOR_SEQUENCE attributes without a value', () => {
  // A provider answers a module as a whole, so an attribute the instance does
  // not carry comes back as a key whose value is undefined. `Object.assign`
  // copies such a key over a real value, and dcmjs then drops the element:
  // a Type 1 attribute of the revision was lost to a gap in its predecessor.
  it('drops an attribute the predecessor has no value for', () => {
    givenPredecessor({
      instanceNumber: '3',
      seriesData: {
        SeriesInstanceUID: SERIES_UID,
        SeriesNumber: undefined,
        Modality: undefined,
        SeriesDescription: 'Liver',
      },
    });

    const result = predecessorSequence();

    expect('SeriesNumber' in result).toBe(false);
    expect('Modality' in result).toBe(false);
    expect(result.SeriesDescription).toBe('Liver');
    expect(result.SeriesInstanceUID).toBe(SERIES_UID);
  });

  it('keeps the value the derivation gave the revision', () => {
    givenPredecessor({
      instanceNumber: '3',
      seriesData: { SeriesInstanceUID: SERIES_UID, SeriesNumber: undefined },
    });
    const dataset = { SeriesNumber: '3100', Modality: 'SEG' };

    Object.assign(dataset, predecessorSequence());

    expect(dataset.SeriesNumber).toBe('3100');
    expect(dataset.Modality).toBe('SEG');
    expect(dataset.SeriesInstanceUID).toBe(SERIES_UID);
  });

  it('takes the value of the predecessor when the predecessor has one', () => {
    givenPredecessor({ instanceNumber: '3' });
    const dataset = { SeriesNumber: '3100' };

    Object.assign(dataset, predecessorSequence());

    expect(dataset.SeriesNumber).toBe('3101');
  });
});
