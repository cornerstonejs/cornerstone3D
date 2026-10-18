/**
 * Builds the full ECG module (including waveformData.retrieveBulkData) from a
 * naturalized instance in NATURAL cache. Used by the typed provider so
 * ECGViewport can get data via metaData.get(MetadataModules.ECG, imageId)
 * without the legacy dicomImageLoader ECG provider.
 */

import { addTypedProvider } from '../../metaData';
import { MetadataModules } from '../../enums';
import type { TypedProvider } from '../../metaData';
import { logging as cornerstoneLogging } from '@cornerstonejs/utils';
import { getSingleBufferFromArray } from '../bulkDataFromArray';
import { decodeMultipartRelated } from '../decodeMultipartRelated';

const cs3dLogger = cornerstoneLogging.metadataLog.getLogger(
  'utilities.metadataProvider.ecgFromInstance'
);

export interface DicomCodeSequenceItem {
  CodeValue?: string;
  CodingSchemeDesignator?: string;
  CodeMeaning?: string;
}

export interface DicomChannelDefinitionItem {
  ChannelSourceSequence?:
    | DicomCodeSequenceItem[]
    | ArrayLike<DicomCodeSequenceItem>;
  ChannelSensitivity?: number | string;
  ChannelSensitivityUnitsSequence?:
    | DicomCodeSequenceItem[]
    | ArrayLike<DicomCodeSequenceItem>;
  ChannelSensitivityCorrectionFactor?: number | string;
  ChannelBaseline?: number | string;
  ChannelSampleSkew?: number | string;
  WaveformBitsStored?: number | string;
}

export interface DicomWaveformAnnotationItem {
  ConceptNameCodeSequence?:
    | DicomCodeSequenceItem[]
    | ArrayLike<DicomCodeSequenceItem>;
  NumericValue?: number | number[] | string | string[];
  MeasurementUnitsCodeSequence?:
    | DicomCodeSequenceItem[]
    | ArrayLike<DicomCodeSequenceItem>;
  UnformattedTextValue?: string | string[];
  TextValue?: string | string[];
  ReferencedSamplePositions?: number | number[];
}

export interface DicomWaveformData {
  retrieveBulkData?: () => Promise<unknown>;
  BulkDataURI?: string;
  InlineBinary?: string;
  Value?: ArrayBuffer | Uint8Array | Int16Array[] | string;
}

export interface DicomWaveformGroupItem {
  NumberOfWaveformChannels?: number;
  NumberOfWaveformSamples?: number;
  SamplingFrequency?: number;
  WaveformBitsAllocated?: number;
  WaveformSampleInterpretation?: string;
  MultiplexGroupLabel?: string;
  ChannelDefinitionSequence?:
    | DicomChannelDefinitionItem[]
    | ArrayLike<DicomChannelDefinitionItem>;
  WaveformData?: DicomWaveformData;
  waveformData?: DicomWaveformData;
}

export interface DicomPatientNameObject {
  Alphabetic?: string;
  Ideographic?: string;
  Phonetic?: string;
}

export interface DicomEcgInstance {
  [key: string]: unknown;
  PatientName?:
    | string
    | DicomPatientNameObject
    | Array<string | DicomPatientNameObject>;
  PatientID?: string;
  PatientSex?: string;
  PatientAge?: string;
  PatientBirthDate?: string;
  StudyDate?: string;
  StudyTime?: string;
  StudyDescription?: string;
  SeriesDescription?: string;
  Modality?: string;
  Manufacturer?: string;
  InstitutionName?: string;
  WaveformSequence?:
    | DicomWaveformGroupItem[]
    | ArrayLike<DicomWaveformGroupItem>;
  WaveformAnnotationSequence?:
    | DicomWaveformAnnotationItem[]
    | ArrayLike<DicomWaveformAnnotationItem>;
}

export interface EcgWaveformAnnotation {
  concept?: {
    codeMeaning?: string;
    codeValue?: string;
    codingSchemeDesignator?: string;
  };
  numericValue?: number;
  unit?: string;
  textValue?: string;
}

export interface EcgAnnotations {
  ventricularHeartRate?: number;
  prInterval?: number;
  qrsDuration?: number;
  qtInterval?: number;
  qtcInterval?: number;
  rrInterval?: number;
  pAxis?: number;
  qrsAxis?: number;
  tAxis?: number;
  interpretations?: string[];
  all?: EcgWaveformAnnotation[];
}

export interface EcgPatientInfo {
  patientName?: string;
  patientId?: string;
  patientSex?: string;
  patientAge?: string;
  patientBirthDate?: string;
}

export interface EcgStudyInfo {
  studyDate?: string;
  studyTime?: string;
  studyDescription?: string;
  seriesDescription?: string;
  modality?: string;
  manufacturer?: string;
  institutionName?: string;
}

export interface EcgModuleFull {
  numberOfWaveformChannels: number;
  numberOfWaveformSamples: number;
  samplingFrequency: number;
  waveformBitsAllocated: number;
  waveformSampleInterpretation: string;
  multiplexGroupLabel: string;
  channelDefinitionSequence: Array<{
    /**
     * The lead of the channel. `codeValue` identifies the lead in every
     * language, for example `5.6.3-9-2` (SCPECG) or `2:2` (MDC) for lead II.
     */
    channelSourceSequence?: {
      codeMeaning?: string;
      codeValue?: string;
      codingSchemeDesignator?: string;
    };
    /**
     * Millivolts that one raw sample unit represents, from
     * `ChannelSensitivity` x `ChannelSensitivityCorrectionFactor`, converted
     * from `ChannelSensitivityUnitsSequence` to millivolts. The value is
     * `ECG_DEFAULT_MV_PER_UNIT` when the instance omits the sensitivity.
     */
    mvPerUnit: number;
  }>;
  waveformData: {
    retrieveBulkData: () => Promise<Int16Array[]>;
  };
  annotations?: EcgAnnotations;
  patientInfo?: EcgPatientInfo;
  studyInfo?: EcgStudyInfo;
}

/**
 * Millivolts for one raw sample unit when the instance carries no channel
 * sensitivity. A 16-bit diagnostic ECG normally samples at 1 microvolt for each
 * unit.
 */
export const ECG_DEFAULT_MV_PER_UNIT = 0.001;

/** Millivolts for one unit of each sensitivity unit that ECG instances use. */
const MV_PER_SENSITIVITY_UNIT: Record<string, number> = {
  v: 1000,
  mv: 1,
  uv: 0.001,
  µv: 0.001,
  nv: 0.000001,
};

/**
 * Returns the millivolts that one raw sample unit of a channel represents.
 *
 * DICOM gives the amplitude of one unit as `ChannelSensitivity`, in the units of
 * `ChannelSensitivityUnitsSequence`, and `ChannelSensitivityCorrectionFactor`
 * corrects that value. The function returns the default when the instance omits
 * the sensitivity, or when the unit code is not a voltage.
 */
function getChannelMvPerUnit(
  channel: Record<string, unknown> | DicomChannelDefinitionItem
): number {
  const sensitivity = Number(channel.ChannelSensitivity);

  if (!Number.isFinite(sensitivity) || sensitivity === 0) {
    return ECG_DEFAULT_MV_PER_UNIT;
  }

  const rawCorrection = Number(channel.ChannelSensitivityCorrectionFactor);
  const correction =
    Number.isFinite(rawCorrection) && rawCorrection !== 0 ? rawCorrection : 1;
  const unitsSeq = toArray(
    channel.ChannelSensitivityUnitsSequence as
      | ArrayLike<Record<string, unknown>>
      | undefined
  );
  const unitCode = (
    (unitsSeq[0]?.CodeValue as string) ??
    (unitsSeq[0]?.CodeMeaning as string) ??
    ''
  )
    .trim()
    .toLowerCase();
  const mvPerSensitivityUnit = MV_PER_SENSITIVITY_UNIT[unitCode];

  if (mvPerSensitivityUnit === undefined) {
    cs3dLogger.warn(
      `[ecgFromInstance] Unknown ChannelSensitivityUnits "${unitCode}". Using ${ECG_DEFAULT_MV_PER_UNIT} mV for each unit.`
    );
    return ECG_DEFAULT_MV_PER_UNIT;
  }

  return sensitivity * correction * mvPerSensitivityUnit;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function convertBuffer(
  dataSrc: ArrayBuffer | ArrayBufferView,
  numberOfChannels: number,
  numberOfSamples: number,
  bits: number,
  type: string
): Int16Array[] {
  const data = ArrayBuffer.isView(dataSrc)
    ? new Uint8Array(dataSrc.buffer, dataSrc.byteOffset, dataSrc.byteLength)
    : new Uint8Array(dataSrc);
  if (bits === 16 && type === 'SS') {
    const ret: Int16Array[] = [];
    const bytesPerSample = 2;
    const totalBytes = bytesPerSample * numberOfChannels * numberOfSamples;
    const length = Math.min(data.length, totalBytes);
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const buffer = new Int16Array(numberOfSamples);
      ret.push(buffer);
      let sampleI = 0;
      for (
        let sample = 2 * channel;
        sample < length;
        sample += 2 * numberOfChannels
      ) {
        const highByte = data[sample + 1];
        const lowByte = data[sample];
        const sign = highByte & 0x80;
        buffer[sampleI++] = sign
          ? 0xffff0000 | (highByte << 8) | lowByte
          : (highByte << 8) | lowByte;
      }
    }
    return ret;
  }
  return [];
}

/**
 * Returns true when `value` already holds one decoded `Int16Array` for each
 * channel, which is the form that `retrieveBulkData` returns.
 */
function isDecodedChannels(
  value: unknown,
  numberOfChannels: number,
  numberOfSamples: number
): value is Int16Array[] {
  return (
    Array.isArray(value) &&
    value.length === numberOfChannels &&
    value.every(
      (channel) =>
        channel instanceof Int16Array && channel.length === numberOfSamples
    )
  );
}

/**
 * Parse wadors: URL to get wadoRsRoot and studyUID for relative BulkDataURI.
 */
function parseWadoRsImageId(imageId: string): {
  wadoRsRoot?: string;
  studyUID?: string;
} {
  const uri = imageId.replace(/^wadors:/i, '');
  const studiesIndex = uri.indexOf('/studies/');
  if (studiesIndex === -1) return {};
  const wadoRsRoot = uri.substring(0, studiesIndex);
  const afterStudies = uri.substring(studiesIndex + 9);
  const nextSlash = afterStudies.indexOf('/');
  const studyUID =
    nextSlash !== -1 ? afterStudies.substring(0, nextSlash) : afterStudies;
  return { wadoRsRoot, studyUID };
}

/** Normalize sequence to array (handles makeArrayLike single-item and real arrays). */
function toArray<T>(seq: T[] | ArrayLike<T> | undefined): T[] {
  if (!seq) return [];
  if (Array.isArray(seq)) return seq;
  if (typeof (seq as ArrayLike<T>).length === 'number') {
    return Array.from(seq as ArrayLike<T>);
  }
  return [seq as T];
}

export type EcgNumericMetricKey =
  | 'ventricularHeartRate'
  | 'prInterval'
  | 'qrsDuration'
  | 'qtInterval'
  | 'qtcInterval'
  | 'rrInterval'
  | 'pAxis'
  | 'qrsAxis'
  | 'tAxis';

/**
 * Fast O(1) lookup table mapping standardized LOINC (LN) and IEEE 11073 (MDC)
 * codes to EcgAnnotations property keys.
 * LOINC codes are immutable international medical standards defined in DICOM Part 16.
 */
export const ECG_CODE_MAP = new Map<string, EcgNumericMetricKey>([
  ['8867-4', 'ventricularHeartRate'], // LOINC: Ventricular Heart Rate
  ['2:1', 'ventricularHeartRate'], // MDC: Ventricular Heart Rate
  ['8625-6', 'prInterval'], // LOINC: P-R Interval
  ['8633-0', 'qrsDuration'], // LOINC: QRS Duration
  ['8634-8', 'qtInterval'], // LOINC: Q-T Interval
  ['8636-3', 'qtcInterval'], // LOINC: Q-Tc Interval
  ['8637-1', 'rrInterval'], // LOINC: R-R Interval
  ['8626-4', 'pAxis'], // LOINC: P Axis
  ['8632-2', 'qrsAxis'], // LOINC: QRS Axis
  ['8638-9', 'tAxis'], // LOINC: T Axis
]);

/**
 * Fallback pattern matchers for real-world ECG carts (GE Marquette, Philips, Mortara,
 * Schiller, Nihon Kohden) that omit CodeValue and only provide descriptive CodeMeaning text.
 * Note: QTc is listed before QT so "QTc" never falsely matches "QT".
 */
export const ECG_MEANING_PATTERNS: Array<[RegExp, EcgNumericMetricKey]> = [
  // Ventricular Heart Rate: "Ventricular Heart Rate", "Ventricular Rate", "Heart Rate", "HR"
  [
    /(^|\b)(ventricular\s+)?heart\s+rate\b|(^|\b)ventricular\s+rate\b|^hr$/i,
    'ventricularHeartRate',
  ],
  // PR Interval: "PR Interval", "P-R Interval", "PR Int", or exact "PR"
  [/(^|\b)p[- ]?r\s*(interval|int)\b|^p[- ]?r$/i, 'prInterval'],
  // QRS Duration: "QRS Duration", "QRS Width", "QRS Interval", or exact "QRS"
  [/(^|\b)qrs\s*(duration|width|interval)\b|^qrs$/i, 'qrsDuration'],
  // QTc Interval MUST be checked before QT Interval so "QTc" never falsely matches "QT"
  [/(^|\b)qtc(\s*(interval|calc|int))?\b|^qtc$/i, 'qtcInterval'],
  // QT Interval: "QT Interval", "Mean QT", or exact "QT"
  [/(^|\b)qt\s*(interval|int)\b|^qt$/i, 'qtInterval'],
  // RR Interval: "RR Interval", "R-R Interval", or exact "RR"
  [/(^|\b)r[- ]?r\s*(interval|int)\b|^r[- ]?r$/i, 'rrInterval'],
  // P Axis: "P Axis", "P wave axis", "Axis P"
  [/(^|\b)p(\s+wave)?\s+axis\b|axis\s+p\b/i, 'pAxis'],
  // QRS Axis: "QRS Axis", "Axis QRS"
  [/(^|\b)qrs\s+axis\b|axis\s+qrs\b/i, 'qrsAxis'],
  // T Axis: "T Axis", "T wave axis", "Axis T"
  [/(^|\b)t(\s+wave)?\s+axis\b|axis\s+t\b/i, 'tAxis'],
];

/**
 * Resolves an ECG metric key from its DICOM concept code or meaning.
 * First performs an O(1) lookup on standard LOINC/MDC code, falling back
 * to pre-compiled regex matching on the concept meaning.
 */
export function matchEcgMetric(
  codeValue: string,
  codeMeaning: string
): EcgNumericMetricKey | undefined {
  const trimmedValue = codeValue?.trim();
  if (trimmedValue && ECG_CODE_MAP.has(trimmedValue)) {
    return ECG_CODE_MAP.get(trimmedValue);
  }
  const trimmedMeaning = codeMeaning?.trim();
  if (trimmedMeaning) {
    const match = ECG_MEANING_PATTERNS.find(([pattern]) =>
      pattern.test(trimmedMeaning)
    );
    return match?.[1];
  }
  return undefined;
}

/**
 * Safely parses a DICOM numeric value which may be a number, a numeric string,
 * or a single-element array of either. Returns undefined for empty or non-finite inputs.
 */
export function parseDicomNumeric(
  raw: number | number[] | string | string[] | undefined | null
): number | undefined {
  if (raw === undefined || raw === null || typeof raw === 'boolean') {
    return undefined;
  }
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (
    val === '' ||
    val === null ||
    val === undefined ||
    typeof val === 'boolean'
  ) {
    return undefined;
  }
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Safely parses a DICOM text value (or single-element array of strings) and trims whitespace.
 * Returns undefined for empty or whitespace-only strings.
 */
export function parseDicomText(
  raw: string | string[] | undefined | null
): string | undefined {
  if (raw === undefined || raw === null || typeof raw === 'boolean') {
    return undefined;
  }
  const val = Array.isArray(raw) ? raw[0] : raw;
  const str = String(val ?? '').trim();
  return str.length > 0 ? str : undefined;
}

/**
 * Extracts measurement units from a DICOM waveform annotation item,
 * preferring CodeMeaning with a fallback to CodeValue.
 */
export function parseDicomUnit(
  item: DicomWaveformAnnotationItem
): string | undefined {
  const unitsSeq = toArray(item.MeasurementUnitsCodeSequence);
  return (
    unitsSeq[0]?.CodeMeaning?.trim() ??
    unitsSeq[0]?.CodeValue?.trim() ??
    undefined
  );
}

export function parseEcgAnnotations(
  instance: Record<string, unknown> | DicomEcgInstance
): EcgAnnotations | undefined {
  const raw = instance.WaveformAnnotationSequence as
    | DicomWaveformAnnotationItem[]
    | ArrayLike<DicomWaveformAnnotationItem>
    | undefined;
  const seq = toArray(raw);
  if (!seq || seq.length === 0) {
    return undefined;
  }

  const annotations: EcgAnnotations = {
    interpretations: [],
    all: [],
  };

  for (const item of seq) {
    if (!item) {
      continue;
    }
    const concepts = toArray(item.ConceptNameCodeSequence);
    const concept = concepts[0];
    const codeMeaning = concept?.CodeMeaning?.trim() ?? '';
    const codeValue = concept?.CodeValue?.trim() ?? '';
    const codingScheme = concept?.CodingSchemeDesignator?.trim() ?? '';

    const numericVal = parseDicomNumeric(item.NumericValue);
    const unit = parseDicomUnit(item);
    const textVal = parseDicomText(item.UnformattedTextValue ?? item.TextValue);
    const metric =
      numericVal !== undefined
        ? matchEcgMetric(codeValue, codeMeaning)
        : undefined;

    // A finding can be free text (TextValue) or a coded diagnostic concept (CodeMeaning with no numeric value)
    const findingText =
      textVal ||
      (numericVal === undefined && !metric && codeMeaning
        ? codeMeaning
        : undefined);

    if (
      codeMeaning ||
      codeValue ||
      numericVal !== undefined ||
      textVal ||
      unit
    ) {
      annotations.all?.push({
        concept:
          codeMeaning || codeValue
            ? {
                codeMeaning,
                codeValue,
                codingSchemeDesignator: codingScheme,
              }
            : undefined,
        numericValue: numericVal,
        unit,
        textValue: textVal,
      });
    }

    if (findingText && !annotations.interpretations?.includes(findingText)) {
      annotations.interpretations?.push(findingText);
    }

    if (numericVal !== undefined && metric) {
      annotations[metric] = numericVal;
    }
  }

  // Derive ventricular heart rate from RR interval if heart rate was not explicitly coded
  if (
    annotations.ventricularHeartRate === undefined &&
    annotations.rrInterval !== undefined &&
    annotations.rrInterval > 0
  ) {
    // If RR interval is given in seconds (< 5s, e.g. 0.85s instead of 850ms), normalize to ms
    const rrMs =
      annotations.rrInterval < 5
        ? annotations.rrInterval * 1000
        : annotations.rrInterval;
    if (rrMs > 0) {
      annotations.ventricularHeartRate = Math.round(60000 / rrMs);
    }
  }

  return annotations;
}

export function parsePatientInfo(
  instance: Record<string, unknown> | DicomEcgInstance
): EcgPatientInfo {
  const patientNameRaw = instance.PatientName;
  let patientName = '';
  if (typeof patientNameRaw === 'string') {
    patientName = patientNameRaw;
  } else if (Array.isArray(patientNameRaw) && patientNameRaw.length > 0) {
    const first = patientNameRaw[0];
    patientName = typeof first === 'string' ? first : first?.Alphabetic || '';
  } else if (patientNameRaw && typeof patientNameRaw === 'object') {
    patientName = (patientNameRaw as DicomPatientNameObject).Alphabetic || '';
  }

  return {
    patientName: patientName || undefined,
    patientId: (instance.PatientID as string) || undefined,
    patientSex: (instance.PatientSex as string) || undefined,
    patientAge: (instance.PatientAge as string) || undefined,
    patientBirthDate: (instance.PatientBirthDate as string) || undefined,
  };
}

export function parseStudyInfo(
  instance: Record<string, unknown> | DicomEcgInstance
): EcgStudyInfo {
  return {
    studyDate: (instance.StudyDate as string) || undefined,
    studyTime: (instance.StudyTime as string) || undefined,
    studyDescription: (instance.StudyDescription as string) || undefined,
    seriesDescription: (instance.SeriesDescription as string) || undefined,
    modality: (instance.Modality as string) || 'ECG',
    manufacturer: (instance.Manufacturer as string) || undefined,
    institutionName: (instance.InstitutionName as string) || undefined,
  };
}

export interface BuildEcgModuleOptions {
  /** Extra request headers for a `BulkDataURI` fetch, for example auth headers. */
  getHeaders?: () => Record<string, string> | undefined;
}

/**
 * Build full EcgModule from a naturalized instance (UpperCamelCase convention).
 *
 * `WaveformData` may hold the bytes (ArrayBuffer, typed array, `Value` or
 * `InlineBinary`), a `retrieveBulkData` method, or a `BulkDataURI`. A
 * `BulkDataURI` fetch accepts `multipart/related` or a single part.
 */
export function buildEcgModuleFromInstance(
  instance: Record<string, unknown>,
  imageId?: string,
  options: BuildEcgModuleOptions = {}
): EcgModuleFull | null {
  const raw = instance.WaveformSequence as
    | ArrayLike<Record<string, unknown>>
    | undefined;
  const groups = toArray(raw);
  if (!groups.length) return null;

  const group = groups[0];
  const numberOfChannels = (group.NumberOfWaveformChannels as number) ?? 0;
  const numberOfSamples = (group.NumberOfWaveformSamples as number) ?? 0;
  const samplingFrequency = (group.SamplingFrequency as number) ?? 1;
  const bitsAllocated = (group.WaveformBitsAllocated as number) ?? 16;
  const sampleInterpretation =
    (group.WaveformSampleInterpretation as string) ?? 'SS';
  const multiplexGroupLabel = (group.MultiplexGroupLabel as string) ?? '';

  const channelDefSeq = toArray(
    group.ChannelDefinitionSequence as
      | ArrayLike<Record<string, unknown>>
      | undefined
  );
  const channelDefinitionSequence = channelDefSeq.map((ch) => {
    const srcSeqArr = toArray(
      ch.ChannelSourceSequence as ArrayLike<Record<string, unknown>> | undefined
    );
    const srcSeq = srcSeqArr[0];
    const codeMeaning = (srcSeq?.CodeMeaning as string) ?? '';
    const codeValue = srcSeq?.CodeValue as string | undefined;
    const codingSchemeDesignator = srcSeq?.CodingSchemeDesignator as
      | string
      | undefined;
    return {
      channelSourceSequence: { codeMeaning, codeValue, codingSchemeDesignator },
      mvPerUnit: getChannelMvPerUnit(ch),
    };
  });

  let waveformDataRaw = group.WaveformData ?? group.waveformData;
  // A naturalized value can be a one-item array. A typed array is the data.
  if (Array.isArray(waveformDataRaw) && waveformDataRaw.length > 0) {
    waveformDataRaw = waveformDataRaw[0];
  }
  const waveformData: DicomWaveformData = waveformDataRaw ?? {};
  const { wadoRsRoot = undefined, studyUID = undefined } = imageId
    ? parseWadoRsImageId(imageId)
    : {};

  const toChannels = (value: unknown): Int16Array[] | undefined => {
    if (isDecodedChannels(value, numberOfChannels, numberOfSamples)) {
      return value;
    }
    const bytes = getSingleBufferFromArray(value);
    return bytes
      ? convertBuffer(
          bytes,
          numberOfChannels,
          numberOfSamples,
          bitsAllocated,
          sampleInterpretation
        )
      : undefined;
  };

  const retrieveBulkData = async (): Promise<Int16Array[]> => {
    // Binary file upload: AsyncDicomReader stores raw bytes as ArrayBuffer / TypedArray
    const channels = toChannels(waveformData) ?? toChannels(waveformData.Value);
    if (channels) {
      return channels;
    }
    if (waveformData.InlineBinary) {
      const raw = base64ToUint8Array(waveformData.InlineBinary);
      return convertBuffer(
        raw,
        numberOfChannels,
        numberOfSamples,
        bitsAllocated,
        sampleInterpretation
      );
    }
    if (typeof waveformData.retrieveBulkData === 'function') {
      const retrieved = toChannels(
        await (waveformData.retrieveBulkData as () => Promise<unknown>)()
      );
      if (retrieved) {
        return retrieved;
      }
    }
    if (waveformData.BulkDataURI) {
      let url = waveformData.BulkDataURI as string;
      if (url.indexOf(':') === -1 && wadoRsRoot) {
        url = studyUID
          ? `${wadoRsRoot}/studies/${studyUID}/${url}`
          : `${wadoRsRoot}/${url}`;
      }
      const response = await fetch(url, {
        headers: {
          Accept: 'multipart/related; type="application/octet-stream"',
          ...options.getHeaders?.(),
        },
      });
      if (!response.ok) {
        throw new Error(
          `[ecgFromInstance] Waveform bulkdata fetch failed: ${response.status}`
        );
      }
      const [part] = decodeMultipartRelated(
        await response.arrayBuffer(),
        response.headers.get('content-type') ?? undefined
      );
      return convertBuffer(
        part,
        numberOfChannels,
        numberOfSamples,
        bitsAllocated,
        sampleInterpretation
      );
    }
    const dataKeys = Object.keys(waveformData);
    cs3dLogger.warn(
      '[ecgFromInstance] No waveform data source found. waveformData keys:',
      dataKeys.slice(0, 10),
      `(${dataKeys.length} total)`
    );
    throw new Error('[ecgFromInstance] No waveform data source found');
  };

  const annotations = parseEcgAnnotations(instance);
  const patientInfo = parsePatientInfo(instance);
  const studyInfo = parseStudyInfo(instance);

  return {
    numberOfWaveformChannels: numberOfChannels,
    numberOfWaveformSamples: numberOfSamples,
    samplingFrequency,
    waveformBitsAllocated: bitsAllocated,
    waveformSampleInterpretation: sampleInterpretation,
    multiplexGroupLabel,
    channelDefinitionSequence,
    waveformData: { retrieveBulkData },
    annotations,
    patientInfo,
    studyInfo,
  };
}

/** Run after instanceLookup (INSTANCE_PRIORITY 5000) so we receive instance as data */
const ECG_FROM_INSTANCE_PRIORITY = 4_000;

/**
 * Typed provider: when data (instance from instanceLookup) has WaveformSequence,
 * return the full ECG module so ECGViewport gets waveformData.retrieveBulkData.
 */
const ecgFromInstanceProvider: TypedProvider = (next, query, data, options) => {
  const instance = data as Record<string, unknown> | undefined;
  const hasWaveform = instance && instance.WaveformSequence;
  if (!hasWaveform) {
    return next(query, data, options);
  }
  const result = buildEcgModuleFromInstance(instance, query);
  return result ?? next(query, data, options);
};

const ECG_AMPLITUDE_INDEX_SIZE = 65536;
const ECG_AMPLITUDE_OFFSET = 32768;

/**
 * CALIBRATION provider for ECG: when instance has WaveformSequence, return
 * sequenceOfUltrasoundRegions so measurement tools get physical units (time, mV).
 */
const ecgCalibrationProvider: TypedProvider = (next, query, data, options) => {
  const instance = data as Record<string, unknown> | undefined;
  const raw = instance?.WaveformSequence;
  const groups = toArray(raw as ArrayLike<Record<string, unknown>> | undefined);
  if (!groups.length) return next(query, data, options);
  const group = groups[0];
  const numberOfWaveformSamples =
    (group.NumberOfWaveformSamples as number) ?? 0;
  const samplingFrequency = (group.SamplingFrequency as number) ?? 1;
  const physicalDeltaX = 1 / (samplingFrequency || 1);
  // One raw sample unit in millivolts, from the channel sensitivity of the
  // first channel. Every channel of a multiplex group shares one sampling
  // frequency, and in practice they share one sensitivity as well.
  const firstChannel = toArray(
    group.ChannelDefinitionSequence as
      | ArrayLike<Record<string, unknown>>
      | undefined
  )[0];
  const physicalDeltaY = firstChannel
    ? getChannelMvPerUnit(firstChannel)
    : ECG_DEFAULT_MV_PER_UNIT;
  return {
    sequenceOfUltrasoundRegions: [
      {
        regionLocationMinX0: 0,
        regionLocationMaxX1: numberOfWaveformSamples,
        regionLocationMinY0: 0,
        regionLocationMaxY1: ECG_AMPLITUDE_INDEX_SIZE - 1,
        referencePixelX0: 0,
        referencePixelY0: ECG_AMPLITUDE_OFFSET,
        physicalDeltaX,
        physicalDeltaY,
        // X is in seconds (DICOM unit code 4), and Y is in millivolts (the
        // Cornerstone extension code -1). The display layer converts seconds to
        // milliseconds; the region does not encode that choice. See
        // getCalibratedUnits.ts.
        physicalUnitsXDirection: 4,
        physicalUnitsYDirection: -1,
        regionDataType: 1,
      },
    ],
  };
};

export function registerEcgFromInstanceProvider(): void {
  addTypedProvider(MetadataModules.ECG, ecgFromInstanceProvider, {
    priority: ECG_FROM_INSTANCE_PRIORITY,
  });
  addTypedProvider(MetadataModules.CALIBRATION, ecgCalibrationProvider, {
    priority: ECG_FROM_INSTANCE_PRIORITY,
  });
}
