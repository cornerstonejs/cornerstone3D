/**
 * Typed provider for scalingModule. Expects instance or natural data in the
 * chain's data field (via dataLookup). Data is assumed to use upper camel case
 * for all tags (DICOM keyword style). Uses NATURAL in the default setup
 * (multiframe, no per-frame scaling). PT: builds InstanceMetadata from data
 * and uses @cornerstonejs/calculate-suv; RTDOSE: returns DoseGridScaling etc.
 */

import { addTypedProvider } from '../../metaData';
import type { TypedProvider } from '../../metaData';
import { MetadataModules } from '../../enums';
import { calculateSUVScalingFactors } from '@cornerstonejs/calculate-suv';
import type { InstanceMetadata } from '@cornerstonejs/calculate-suv';

function timeToString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const t = v as {
      hours?: number;
      minutes?: number;
      seconds?: number;
      fractionalSeconds?: number;
    };
    const hours = `${t?.hours ?? '00'}`.padStart(2, '0');
    const minutes = `${t?.minutes ?? '00'}`.padStart(2, '0');
    const seconds = `${t?.seconds ?? '00'}`.padStart(2, '0');
    const fractionalSeconds = `${t?.fractionalSeconds ?? '000000'}`.padEnd(
      6,
      '0'
    );
    return `${hours}${minutes}${seconds}.${fractionalSeconds}`;
  }
  return v as string;
}

function dateToString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && !Array.isArray(v) && 'year' in v) {
    const d = v as { year: number; month: number; day: number };
    const month = `${d.month}`.padStart(2, '0');
    const day = `${d.day}`.padStart(2, '0');
    return `${d.year}${month}${day}`;
  }
  return v as string;
}

function parseNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

/** First item of RadiopharmaceuticalInfo (sequence); supports array or array-like (e.g. makeArrayLike). */
function getRadiopharmaceuticalInfo(
  data: Record<string, unknown>
): Record<string, unknown> | undefined {
  const ri = data.RadiopharmaceuticalInfo;
  if (ri == null || typeof ri !== 'object') return undefined;
  const first = Array.isArray(ri)
    ? ri[0]
    : ((ri as { 0?: unknown; length?: number })[0] ?? ri);
  return first && typeof first === 'object' && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : undefined;
}

/**
 * Build InstanceMetadata for calculate-suv from data. Data is assumed to use
 * upper camel case for all tags (Modality, SeriesDate, PatientWeight, etc.).
 */
function buildPTInstanceMetadataFromData(
  data: Record<string, unknown>
): InstanceMetadata | null {
  if (data.Modality !== 'PT') return null;

  const {
    SeriesDate: seriesDate,
    SeriesTime: seriesTime,
    AcquisitionDate: acquisitionDate,
    AcquisitionTime: acquisitionTime,
    PatientWeight: patientWeight,
    CorrectedImage: correctedImage,
    Units: units,
    DecayCorrection: decayCorrection,
  } = data;

  const ri = getRadiopharmaceuticalInfo(data);
  if (!ri) return null;
  const radionuclideTotalDose = parseNumber(ri.RadionuclideTotalDose);
  const radionuclideHalfLife = parseNumber(ri.RadionuclideHalfLife);
  const radiopharmaceuticalStartDateTime =
    ri.RadiopharmaceuticalStartDateTime as string | undefined;
  const radiopharmaceuticalStartTime = ri.RadiopharmaceuticalStartTime as
    | string
    | undefined;

  const patientWeightNum = parseNumber(patientWeight);
  if (
    seriesDate === undefined ||
    seriesTime === undefined ||
    patientWeightNum === undefined ||
    acquisitionDate === undefined ||
    acquisitionTime === undefined ||
    correctedImage === undefined ||
    units === undefined ||
    decayCorrection === undefined ||
    radionuclideTotalDose === undefined ||
    radionuclideHalfLife === undefined
  ) {
    return null;
  }

  const toDate = (v: unknown): string =>
    typeof v === 'string'
      ? v
      : v && typeof v === 'object' && 'year' in v
        ? dateToString(v as { year: number; month: number; day: number })
        : (v as string);
  const toTime = (v: unknown): string =>
    typeof v === 'string'
      ? v
      : v && typeof v === 'object'
        ? timeToString(v as Parameters<typeof timeToString>[0])
        : (v as string);

  const correctedImageValue =
    typeof correctedImage === 'string'
      ? correctedImage.split('\\')
      : Array.isArray(correctedImage)
        ? correctedImage
        : correctedImage;

  const instanceMetadata: InstanceMetadata = {
    CorrectedImage: correctedImageValue as string | string[],
    Units: units as string,
    RadionuclideHalfLife: radionuclideHalfLife,
    RadionuclideTotalDose: radionuclideTotalDose,
    DecayCorrection: decayCorrection as string,
    PatientWeight: patientWeightNum,
    SeriesDate: dateToString(seriesDate),
    SeriesTime: timeToString(seriesTime),
    AcquisitionDate: dateToString(acquisitionDate),
    AcquisitionTime: timeToString(acquisitionTime),
  };

  if (radiopharmaceuticalStartDateTime !== undefined) {
    instanceMetadata.RadiopharmaceuticalStartDateTime = dateToString(
      radiopharmaceuticalStartDateTime
    );
  }
  if (radiopharmaceuticalStartTime !== undefined) {
    instanceMetadata.RadiopharmaceuticalStartTime = timeToString(
      radiopharmaceuticalStartTime
    );
  }

  if (data.PatientSex !== undefined)
    instanceMetadata.PatientSex = data.PatientSex as string;
  if (data.PatientSize !== undefined)
    instanceMetadata.PatientSize = data.PatientSize as number;

  return instanceMetadata;
}

function scalingFromInstanceProvider(
  next: (query: string, data?: unknown, options?: unknown) => unknown,
  query: string,
  data?: unknown,
  options?: unknown
): unknown {
  if (data == null || typeof data !== 'object') {
    return next(query, data, options);
  }

  const d = data as Record<string, unknown>;

  if (d.Modality === 'RTDOSE') {
    const doseGridScaling = parseNumber(d.DoseGridScaling);
    const { DoseSummation, DoseType, DoseUnit } = d;
    if (
      doseGridScaling !== undefined ||
      DoseSummation !== undefined ||
      DoseType !== undefined ||
      DoseUnit !== undefined
    ) {
      return {
        DoseGridScaling: doseGridScaling,
        DoseSummation,
        DoseType,
        DoseUnit,
      };
    }
  }

  if (d.Modality === 'PT') {
    const instanceMetadata = buildPTInstanceMetadataFromData(d);
    if (!instanceMetadata) {
      return next(query, undefined, options);
    }
    try {
      const factors = calculateSUVScalingFactors([instanceMetadata]);
      return factors[0] ?? next(query, undefined, options);
    } catch {
      return next(query, undefined, options);
    }
  }

  return next(query, undefined, options);
}

export function registerScalingFromInstanceProvider(): void {
  addTypedProvider(
    MetadataModules.SCALING,
    scalingFromInstanceProvider as TypedProvider,
    { priority: 0, isDefault: true }
  );
}
