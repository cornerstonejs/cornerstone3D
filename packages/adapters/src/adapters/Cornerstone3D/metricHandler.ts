import { mapUnitFromUCUM } from './unitMapper';

const INTENSITY_METRICS = new Set([
  'Mean',
  'Standard Deviation',
  'Maximum',
  'Minimum',
]);

export interface AdditionalMetrics {
  mean?: number;
  stdDev?: number;
  max?: number;
  min?: number;
  area?: number;
  radius?: number;
  modalityUnit?: string;
  areaUnit?: string;
  [key: string]: number | string | undefined;
}

/**
 * Extracts all NUM (numeric measurement) groups from a TID1500 Measurement Group’s
 * `ContentSequence`, organizing them by their referenced SOP Instance UID.
 *
 * Each NUM group represents a quantitative measurement (e.g., Mean, Area, Length)
 * recorded in the DICOM SR. This function collects all such entries, extracting
 * their numeric values, units, and associated DICOM concept meanings.
 *
 * The result is a dictionary keyed by `ReferencedSOPInstanceUID`, where each value
 * contains a set of measurements for that instance (e.g., `{ Mean: { value, unit }, Area: { value, unit } }`).
 *
 * @param {Object} MeasurementGroup - The TID1500 Measurement Group content item to parse.
 *
 * @returns {Object} A dictionary of extracted NUM groups organized by SOP Instance UID.
 */

export function extractAllNUMGroups(
  MeasurementGroup,
  referencedSOPInstanceUID
) {
  const numGroupsBySOPInstanceUID = {};

  if (MeasurementGroup.ContentSequence) {
    MeasurementGroup.ContentSequence.forEach((item) => {
      if (item.ValueType === 'NUM' && item.ConceptNameCodeSequence) {
        const codeMeaning = item.ConceptNameCodeSequence.CodeMeaning;
        const numericValue = item.MeasuredValueSequence?.NumericValue;
        const unitCode =
          item.MeasuredValueSequence?.MeasurementUnitsCodeSequence?.CodeValue;

        if (numericValue !== undefined && referencedSOPInstanceUID) {
          if (!numGroupsBySOPInstanceUID[referencedSOPInstanceUID]) {
            numGroupsBySOPInstanceUID[referencedSOPInstanceUID] = {};
          }

          let unit = '';
          if (unitCode) {
            unit = resolveUnit(codeMeaning, unitCode);
          }

          numGroupsBySOPInstanceUID[referencedSOPInstanceUID][codeMeaning] = {
            value: numericValue,
            unit,
          };
        }
      }
    });
  }

  return numGroupsBySOPInstanceUID;
}

/**
 * Restores additional measurement metrics from previously extracted NUM groups.
 *
 * Maps DICOM Concept Name Code Meanings (e.g., "Mean", "Area") to internal
 * `cachedStats` property names, reconstructing a flat metrics object
 * (e.g., `{ mean, stdDev, area, length, ... }`) with proper units.
 *
 * Also detects and assigns the appropriate unit category for each metric
 * (e.g., modalityUnit, areaUnit, radiusUnit) and formats area units with
 * superscripts where applicable.
 *
 * @param {Object} numGroups - An object of NUM groups extracted via {@link extractAllNUMGroups}.
 * @returns {AdditionalMetrics} An object containing reconstructed measurement metrics and their associated units.
 *
 */

export function restoreAdditionalMetrics(numGroups): AdditionalMetrics {
  const additionalMetrics: AdditionalMetrics = {};
  let modalityUnit: string = '';

  const metricMapping = {
    Mean: 'mean',
    'Standard Deviation': 'stdDev',
    Maximum: 'max',
    Minimum: 'min',
    Area: 'area',
    Radius: 'radius',
    Perimeter: 'perimeter',
    Length: 'length',
    Width: 'width',
  };

  // Define what kind of unit each metric type should use
  const unitCategory = {
    mean: 'modalityUnit',
    stdDev: 'modalityUnit',
    max: 'modalityUnit',
    min: 'modalityUnit',
    area: 'areaUnit',
    radius: 'radiusUnit',
    perimeter: 'unit',
    length: 'unit',
    width: 'widthUnit',
  };

  for (const [codeMeaning, metricKey] of Object.entries(metricMapping)) {
    const group = numGroups[codeMeaning];
    if (!group) {
      continue;
    }

    const { value, unit } = group;
    if (value == null) {
      continue;
    }

    additionalMetrics[metricKey] = value;

    if (!unit) {
      continue;
    }

    const mappedUnit = mapUnitFromUCUM(unit);

    if (!mappedUnit) {
      continue;
    }

    if (INTENSITY_METRICS.has(codeMeaning) && !modalityUnit) {
      modalityUnit = mappedUnit;
    }

    const category = unitCategory[metricKey];
    if (category) {
      if (!additionalMetrics[category]) {
        additionalMetrics[category] = mappedUnit;
      }
    } else {
      additionalMetrics[`${metricKey}Unit`] = mappedUnit;
    }
  }

  additionalMetrics.modalityUnit = modalityUnit;

  return additionalMetrics;
}

/**
 * Handles dimensionless UCUM units ("1"), intensity metrics (unitless),
 * and geometric metrics such as Area (squared units).
 *
 * @param codeMeaning - DICOM Concept Name (e.g. "Mean", "Area")
 * @param unitCode - Measurement Units Code Sequence
 * @returns Formatted unit string or empty string if unitless
 */

function resolveUnit(
  codeMeaning: string,
  unitCode?: {
    CodeValue: string;
    CodeMeaning: string;
  }
): string {
  if (!unitCode) {
    return '';
  }

  const { CodeValue, CodeMeaning } = unitCode;

  if (CodeValue === '1') {
    if (!INTENSITY_METRICS.has(codeMeaning) && codeMeaning === 'Area') {
      return `${CodeMeaning}\u00B2`;
    }
    return INTENSITY_METRICS.has(codeMeaning) ? '' : CodeMeaning;
  }

  return CodeValue;
}
