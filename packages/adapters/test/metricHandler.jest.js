import { describe, it, expect } from '@jest/globals';
import { utilities } from 'dcmjs';
import {
  extractAllNUMGroups,
  restoreAdditionalMetrics,
} from '../src/adapters/Cornerstone3D/metricHandler';
import {
  DISPLAY_HOUNSFIELD_UNIT,
  DISPLAY_SQUARE_MILLIMETER,
  DISPLAY_SUV,
  UCUM_HOUNSFIELD_UNIT,
  UCUM_SQUARE_MILLIMETER,
  UCUM_SUV_BODY_WEIGHT,
} from '../src/adapters/Cornerstone3D/unitMapper';

const { addAccessors } = utilities;

const sopInstanceUID = '1.2.3.4';

// Builds a single item sequence the way dcmjs naturalizes it: an array
// proxy that also reads the item properties directly
function createSequence(item) {
  return addAccessors([item]);
}

function createNumItem(codeMeaning, value, unitCodeValue, unitCodeMeaning) {
  return {
    ValueType: 'NUM',
    ConceptNameCodeSequence: createSequence({ CodeMeaning: codeMeaning }),
    MeasuredValueSequence: createSequence({
      NumericValue: value,
      ...(unitCodeValue && {
        MeasurementUnitsCodeSequence: createSequence({
          CodeValue: unitCodeValue,
          CodeMeaning: unitCodeMeaning ?? unitCodeValue,
        }),
      }),
    }),
  };
}

function createMeasurementGroup(items) {
  return { ContentSequence: items };
}

describe('extractAllNUMGroups', () => {
  it('reads the unit from the full MeasurementUnitsCodeSequence item', () => {
    const measurementGroup = createMeasurementGroup([
      createNumItem('Area', 100, UCUM_SQUARE_MILLIMETER),
      createNumItem('Mean', 40, UCUM_HOUNSFIELD_UNIT),
    ]);

    expect(extractAllNUMGroups(measurementGroup, sopInstanceUID)).toEqual({
      [sopInstanceUID]: {
        Area: { value: 100, unit: UCUM_SQUARE_MILLIMETER },
        Mean: { value: 40, unit: UCUM_HOUNSFIELD_UNIT },
      },
    });
  });

  it('keeps an empty unit for intensity metrics with the no unit code', () => {
    const measurementGroup = createMeasurementGroup([
      createNumItem('Mean', 12, '1', 'px'),
    ]);

    expect(extractAllNUMGroups(measurementGroup, sopInstanceUID)).toEqual({
      [sopInstanceUID]: { Mean: { value: 12, unit: '' } },
    });
  });

  it('keeps an empty unit when the units code sequence is missing', () => {
    const measurementGroup = createMeasurementGroup([
      createNumItem('Mean', 12),
    ]);

    expect(extractAllNUMGroups(measurementGroup, sopInstanceUID)).toEqual({
      [sopInstanceUID]: { Mean: { value: 12, unit: '' } },
    });
  });

  it('returns no groups without a referenced SOP Instance UID', () => {
    const measurementGroup = createMeasurementGroup([
      createNumItem('Area', 100, UCUM_SQUARE_MILLIMETER),
    ]);

    expect(extractAllNUMGroups(measurementGroup, undefined)).toEqual({});
  });
});

describe('restoreAdditionalMetrics', () => {
  it('restores the area and modality display units of a loaded SR', () => {
    const measurementGroup = createMeasurementGroup([
      createNumItem('Area', 100, UCUM_SQUARE_MILLIMETER),
      createNumItem('Mean', 40, UCUM_HOUNSFIELD_UNIT),
      createNumItem('Maximum', 90, UCUM_HOUNSFIELD_UNIT),
    ]);
    const numGroups = extractAllNUMGroups(measurementGroup, sopInstanceUID);

    expect(restoreAdditionalMetrics(numGroups[sopInstanceUID])).toEqual({
      area: 100,
      areaUnit: DISPLAY_SQUARE_MILLIMETER,
      mean: 40,
      max: 90,
      modalityUnit: DISPLAY_HOUNSFIELD_UNIT,
    });
  });

  it('restores the body weight SUV code as the SUV display unit', () => {
    const measurementGroup = createMeasurementGroup([
      createNumItem('Mean', 2.5, UCUM_SUV_BODY_WEIGHT),
    ]);
    const numGroups = extractAllNUMGroups(measurementGroup, sopInstanceUID);

    expect(restoreAdditionalMetrics(numGroups[sopInstanceUID])).toEqual({
      mean: 2.5,
      modalityUnit: DISPLAY_SUV,
    });
  });

  it('restores a dcmjs arbitrary unit as the inner unit', () => {
    const measurementGroup = createMeasurementGroup([
      createNumItem('Mean', 1200, "[arb'U]{BQML}", 'arbitrary BQML'),
    ]);
    const numGroups = extractAllNUMGroups(measurementGroup, sopInstanceUID);

    expect(restoreAdditionalMetrics(numGroups[sopInstanceUID])).toEqual({
      mean: 1200,
      modalityUnit: 'BQML',
    });
  });
});
