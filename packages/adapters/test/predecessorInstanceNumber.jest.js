import { describe, it, expect, jest } from '@jest/globals';

const mockGet = jest.fn();
const mockWarn = jest.fn();

// `metaData.get`, `addProvider` and the logger are stubbed, so the module can
// be driven directly and the tests can read what it warns about.
jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    utilities: {
      ...actual.utilities,
      logger: {
        ...actual.utilities.logger,
        adaptersLog: {
          getLogger: () => ({ warn: (...args) => mockWarn(...args) }),
        },
      },
    },
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
const INSTANCE_UID = '1.2.826.0.1.3680043.8.498.901';
const SEG_SOP_CLASS_UID = '1.2.840.10008.5.1.4.1.1.66.4';

/**
 * Answers the four modules the predecessor sequence is built from. Pass `null`
 * for a module that no provider holds, and an object for a module that holds
 * only some of the attributes.
 */
function givenPredecessor({
  instanceNumber,
  seriesData,
  generalImage,
  sopModule,
  study,
}) {
  mockWarn.mockClear();
  mockGet.mockImplementation((moduleType) => {
    switch (moduleType) {
      case MetadataModules.SERIES_DATA:
        return seriesData === undefined
          ? { SeriesInstanceUID: SERIES_UID, SeriesNumber: '3101' }
          : seriesData;
      case MetadataModules.SOP_COMMON:
        return sopModule === undefined
          ? { sopClassUID: SEG_SOP_CLASS_UID, sopInstanceUID: INSTANCE_UID }
          : sopModule;
      case MetadataModules.GENERAL_IMAGE:
        return generalImage === undefined ? { instanceNumber } : generalImage;
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
    ).toBe(INSTANCE_UID);
    expect(result.SeriesInstanceUID).toBe(SERIES_UID);
  });
});

describe('PREDECESSOR_SEQUENCE reference', () => {
  // The provider read both UIDs from the General Image module, which a host
  // can answer without the class UID. Type 1 ReferencedSOPClassUID went missing.
  it('takes both UIDs from the SOP Common module', () => {
    givenPredecessor({
      instanceNumber: '3',
      generalImage: { instanceNumber: '3' },
    });

    const reference =
      predecessorSequence().PredecessorDocumentsSequence
        .ReferencedSeriesSequence.ReferencedSOPSequence;

    expect(reference.ReferencedSOPClassUID).toBe(SEG_SOP_CLASS_UID);
    expect(reference.ReferencedSOPInstanceUID).toBe(INSTANCE_UID);
  });
});

describe('PREDECESSOR_SEQUENCE with a predecessor no provider holds', () => {
  // Reading the UIDs off `undefined` threw a TypeError, and the throw took the
  // whole save with it. A stale imageId reaches this.
  it('answers undefined when no provider holds the instance', () => {
    givenPredecessor({ instanceNumber: '3', sopModule: null });
    expect(predecessorSequence()).toBeUndefined();
  });

  it('answers undefined when the instance names no SOP Instance UID', () => {
    givenPredecessor({
      instanceNumber: '3',
      sopModule: { sopClassUID: SEG_SOP_CLASS_UID },
    });
    expect(predecessorSequence()).toBeUndefined();
  });

  // ReferencedSOPClassUID is Type 1 too, so an absent class UID gives the same
  // no-op as an absent instance UID.
  it('answers undefined when the instance names no SOP Class UID', () => {
    givenPredecessor({
      instanceNumber: '3',
      sopModule: { sopInstanceUID: INSTANCE_UID },
    });
    expect(predecessorSequence()).toBeUndefined();
  });

  // Every consumer merges the result with `Object.assign`, so an answer of
  // undefined has to be a no-op rather than a crash.
  it('leaves a dataset untouched when it answers undefined', () => {
    givenPredecessor({ sopModule: {} });
    const dataset = { SeriesNumber: '3100', Modality: 'SEG' };

    Object.assign(dataset, predecessorSequence());

    expect(dataset).toEqual({ SeriesNumber: '3100', Modality: 'SEG' });
  });

  // The no-op is silent in the consumer, so the warning is the only report.
  it('warns and names the predecessor when it answers undefined', () => {
    givenPredecessor({ instanceNumber: '3', sopModule: null });

    predecessorSequence();

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][0]).toContain(IMAGE_ID);
  });

  it('does not warn when it answers a predecessor', () => {
    givenPredecessor({ instanceNumber: '3' });

    predecessorSequence();

    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('does not throw when the study module is absent', () => {
    givenPredecessor({ instanceNumber: '3', study: null });
    expect(
      predecessorSequence().PredecessorDocumentsSequence.StudyInstanceUID
    ).toBeUndefined();
  });

  // The instance number is the only attribute this module takes from the
  // General Image module, so an absent module gives the number of a first
  // instance and keeps the link back.
  it('does not throw when the general image module is absent', () => {
    givenPredecessor({ generalImage: null });
    const result = predecessorSequence();

    expect(result.InstanceNumber).toBe(1);
    expect(
      result.PredecessorDocumentsSequence.ReferencedSeriesSequence
        .ReferencedSOPSequence.ReferencedSOPInstanceUID
    ).toBe(INSTANCE_UID);
  });
});

describe('PREDECESSOR_SEQUENCE attributes without a value', () => {
  // Merging a key whose value is undefined lost a Type 1 attribute of the
  // revision to a gap in its predecessor.
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

  it('takes the series date and time of the predecessor when it has them', () => {
    givenPredecessor({
      instanceNumber: '3',
      seriesData: {
        SeriesInstanceUID: SERIES_UID,
        SeriesDate: '20230405',
        SeriesTime: '090000.000000',
      },
    });

    const result = predecessorSequence();

    expect(result.SeriesDate).toBe('20230405');
    expect(result.SeriesTime).toBe('090000.000000');
  });

  it('takes the value of the predecessor when the predecessor has one', () => {
    givenPredecessor({ instanceNumber: '3' });
    const dataset = { SeriesNumber: '3100' };

    Object.assign(dataset, predecessorSequence());

    expect(dataset.SeriesNumber).toBe('3101');
  });
});
