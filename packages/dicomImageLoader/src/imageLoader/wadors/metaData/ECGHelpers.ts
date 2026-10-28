import type { WADORSMetaDataElement } from '../../../types';
import {
  logging,
  utilities as metadataUtilities,
} from '@cornerstonejs/metadata';
import type {
  EcgAnnotations,
  EcgPatientInfo,
  EcgStudyInfo,
} from '@cornerstonejs/metadata';
import getValue from './getValue';
import getNumberValue from './getNumberValue';
import getSequenceItems from './getSequenceItems';

const log = logging.loaderLog.getLogger('wadors');

// DICOM tags for the Waveform module
const TAG = {
  WaveformSequence: '54000100',
  NumberOfWaveformChannels: '003A0005',
  NumberOfWaveformSamples: '003A0010',
  SamplingFrequency: '003A001A',
  MultiplexGroupLabel: '003A0020',
  ChannelDefinitionSequence: '003A0200',
  ChannelSourceSequence: '003A0208',
  CodeMeaning: '00080104',
  WaveformBitsAllocated: '54001004',
  WaveformSampleInterpretation: '54001006',
  WaveformData: '54001010',
  WaveformAnnotationSequence: '0040B020',
  ConceptNameCodeSequence: '0040A043',
  NumericValue: '0040A30A',
  MeasurementUnitsCodeSequence: '004008EA',
  UnformattedTextValue: '0040A160',
  TextValue: '00700006',
  CodeValue: '00080100',
  PatientName: '00100010',
  PatientID: '00100020',
  PatientSex: '00100040',
  PatientAge: '00101010',
  PatientBirthDate: '00100030',
  StudyDate: '00080020',
  StudyTime: '00080030',
  StudyDescription: '00081030',
  SeriesDescription: '0008103E',
  Modality: '00080060',
  Manufacturer: '00080070',
  InstitutionName: '00080080',
} as const;

export interface EcgModule {
  numberOfWaveformChannels: number;
  numberOfWaveformSamples: number;
  samplingFrequency: number;
  waveformBitsAllocated: number;
  waveformSampleInterpretation: string;
  multiplexGroupLabel: string;
  channelDefinitionSequence: Array<{
    channelSourceSequence?: { codeMeaning?: string };
  }>;
  waveformData: {
    retrieveBulkData: () => Promise<Int16Array[]>;
  };
  annotations?: EcgAnnotations;
  patientInfo?: EcgPatientInfo;
  studyInfo?: EcgStudyInfo;
}

/**
 * Decodes a base64 string to a Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts raw waveform buffer to per-channel Int16Array data.
 * Handles interleaved 16-bit signed short format.
 */
function convertBuffer(
  dataSrc: ArrayBuffer | Uint8Array,
  numberOfChannels: number,
  numberOfSamples: number,
  bits: number,
  type: string
): Int16Array[] {
  const data = new Uint8Array(dataSrc);

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

  log.warn(
    `[ECGHelpers] Unsupported waveform format: ${bits}-bit ${type}. Only 16-bit SS is supported.`
  );
  return [];
}

/**
 * Decodes multipart/related response to extract binary parts.
 */
function multipartDecode(response: ArrayBuffer): ArrayBuffer[] {
  const message = new Uint8Array(response);
  const separator = new TextEncoder().encode('\r\n\r\n');

  // Find the header separator
  const headerIndex = findToken(message, separator, 0, 1000);
  if (headerIndex === -1) {
    return [response];
  }

  const headerStr = new TextDecoder().decode(message.slice(0, headerIndex));
  const boundaryString = identifyBoundary(headerStr);
  if (!boundaryString) {
    return [response];
  }

  const boundary = new TextEncoder().encode(boundaryString);
  const components: ArrayBuffer[] = [];
  let offset = headerIndex + separator.length;

  let boundaryIndex = findToken(message, boundary, offset);
  while (boundaryIndex !== -1) {
    const contentStart = findToken(message, separator, boundaryIndex, 1000);
    if (contentStart === -1) {
      break;
    }
    const dataStart = contentStart + separator.length;
    const nextBoundary = findToken(message, boundary, dataStart);
    const dataEnd = nextBoundary === -1 ? message.length : nextBoundary - 2;
    components.push(response.slice(dataStart, dataEnd));
    if (nextBoundary === -1) {
      break;
    }
    offset = nextBoundary;
    boundaryIndex = findToken(message, boundary, offset + boundary.length);
    if (boundaryIndex === -1) {
      break;
    }
  }

  return components.length > 0 ? components : [response];
}

function findToken(
  message: Uint8Array,
  token: Uint8Array,
  startIndex: number,
  maxLength?: number
): number {
  const end = maxLength
    ? Math.min(message.length, startIndex + maxLength)
    : message.length;
  for (let i = startIndex; i < end - token.length + 1; i++) {
    let found = true;
    for (let j = 0; j < token.length; j++) {
      if (message[i + j] !== token[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      return i;
    }
  }
  return -1;
}

function identifyBoundary(header: string): string | null {
  const match = header.match(/boundary=([^\s;]+)/i);
  if (match) {
    return `--${match[1].replace(/"/g, '')}`;
  }
  return null;
}

/**
 * Creates a closure that retrieves bulk waveform data from various sources
 * (InlineBinary, BulkDataURI, or dicomweb-client retrieveBulkData).
 *
 * @returns A function that returns a Promise resolving to the decoded channel arrays.
 * @throws If no data source is found.
 */
function makeRetrieveBulkData(
  waveformData: Record<string, unknown>,
  numberOfChannels: number,
  numberOfSamples: number,
  bitsAllocated: number,
  sampleInterpretation: string,
  wadoRsRoot?: string,
  studyUID?: string
): () => Promise<Int16Array[]> {
  return async () => {
    // Method 1: Already decoded Value
    if (waveformData.Value) {
      return waveformData.Value as Int16Array[];
    }

    // Method 2: InlineBinary (base64)
    if (waveformData.InlineBinary) {
      const raw = base64ToUint8Array(waveformData.InlineBinary as string);
      return convertBuffer(
        raw,
        numberOfChannels,
        numberOfSamples,
        bitsAllocated,
        sampleInterpretation
      );
    }

    // Method 3: retrieveBulkData function (from dicomweb-client)
    if (typeof waveformData.retrieveBulkData === 'function') {
      const bulkdata = await waveformData.retrieveBulkData();
      return convertBuffer(
        bulkdata,
        numberOfChannels,
        numberOfSamples,
        bitsAllocated,
        sampleInterpretation
      );
    }

    // Method 4: BulkDataURI
    if (waveformData.BulkDataURI) {
      let url = waveformData.BulkDataURI as string;
      if (url.indexOf(':') === -1 && wadoRsRoot) {
        url = studyUID
          ? `${wadoRsRoot}/studies/${studyUID}/${url}`
          : `${wadoRsRoot}/${url}`;
      }
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || '';
      const decoded = contentType.includes('multipart')
        ? multipartDecode(buffer)[0]
        : buffer;
      return convertBuffer(
        decoded,
        numberOfChannels,
        numberOfSamples,
        bitsAllocated,
        sampleInterpretation
      );
    }

    throw new Error('[ECGHelpers] No data source found in WaveformData');
  };
}

function parseRawAnnotations(
  metadata: Record<string, unknown>
): EcgAnnotations | undefined {
  const annotationSeqItems = getSequenceItems(
    metadata[TAG.WaveformAnnotationSequence]
  );
  if (!annotationSeqItems || annotationSeqItems.length === 0) {
    return undefined;
  }

  const annotations: EcgAnnotations = {
    interpretations: [],
    all: [],
  };

  for (const item of annotationSeqItems) {
    const itemRecord = item as unknown as Record<string, unknown>;
    const conceptItems = getSequenceItems(
      itemRecord[TAG.ConceptNameCodeSequence]
    );
    const concept =
      (conceptItems?.[0] as unknown as Record<string, unknown>) || {};
    const codeMeaning =
      (
        getValue(concept[TAG.CodeMeaning] as WADORSMetaDataElement) as string
      )?.trim() ?? '';
    const codeValue =
      (
        getValue(concept[TAG.CodeValue] as WADORSMetaDataElement) as string
      )?.trim() ?? '';

    const rawNum = getNumberValue(
      itemRecord[TAG.NumericValue] as WADORSMetaDataElement
    );
    const numericVal =
      rawNum !== undefined && Number.isFinite(rawNum)
        ? (rawNum as number)
        : undefined;

    const unitsSeqItems = getSequenceItems(
      itemRecord[TAG.MeasurementUnitsCodeSequence]
    );
    const unitsSeq =
      (unitsSeqItems?.[0] as unknown as Record<string, unknown>) || {};
    const unit =
      (
        getValue(unitsSeq[TAG.CodeMeaning] as WADORSMetaDataElement) as string
      )?.trim() ??
      (
        getValue(unitsSeq[TAG.CodeValue] as WADORSMetaDataElement) as string
      )?.trim() ??
      undefined;

    const rawText =
      (getValue(
        itemRecord[TAG.UnformattedTextValue] as WADORSMetaDataElement
      ) as string) ??
      (getValue(itemRecord[TAG.TextValue] as WADORSMetaDataElement) as string);
    const textVal = rawText?.trim();
    const metric =
      numericVal !== undefined
        ? metadataUtilities.matchEcgMetric(codeValue, codeMeaning)
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
                codingSchemeDesignator: '',
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

  if (
    annotations.ventricularHeartRate === undefined &&
    annotations.rrInterval !== undefined &&
    annotations.rrInterval > 0
  ) {
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

function parsePatientInfo(metadata: Record<string, unknown>): EcgPatientInfo {
  const patientNameElem = metadata[TAG.PatientName] as
    | WADORSMetaDataElement
    | undefined;
  let patientName = '';
  if (patientNameElem?.Value) {
    const raw = patientNameElem.Value;
    if (Array.isArray(raw) && raw.length > 0) {
      const first = raw[0];
      if (typeof first === 'string') {
        patientName = first;
      } else if (first && typeof first === 'object') {
        const obj = first as { Alphabetic?: string };
        patientName = typeof obj.Alphabetic === 'string' ? obj.Alphabetic : '';
      }
    } else if (typeof raw === 'string') {
      patientName = raw;
    } else if (raw && typeof raw === 'object') {
      const obj = raw as { Alphabetic?: string };
      patientName = typeof obj.Alphabetic === 'string' ? obj.Alphabetic : '';
    }
  }

  return {
    patientName: patientName || undefined,
    patientId:
      (getValue(metadata[TAG.PatientID] as WADORSMetaDataElement) as string) ||
      undefined,
    patientSex:
      (getValue(metadata[TAG.PatientSex] as WADORSMetaDataElement) as string) ||
      undefined,
    patientAge:
      (getValue(metadata[TAG.PatientAge] as WADORSMetaDataElement) as string) ||
      undefined,
    patientBirthDate:
      (getValue(
        metadata[TAG.PatientBirthDate] as WADORSMetaDataElement
      ) as string) || undefined,
  };
}

function parseStudyInfo(metadata: Record<string, unknown>): EcgStudyInfo {
  return {
    studyDate:
      (getValue(metadata[TAG.StudyDate] as WADORSMetaDataElement) as string) ||
      undefined,
    studyTime:
      (getValue(metadata[TAG.StudyTime] as WADORSMetaDataElement) as string) ||
      undefined,
    studyDescription:
      (getValue(
        metadata[TAG.StudyDescription] as WADORSMetaDataElement
      ) as string) || undefined,
    seriesDescription:
      (getValue(
        metadata[TAG.SeriesDescription] as WADORSMetaDataElement
      ) as string) || undefined,
    modality:
      (getValue(metadata[TAG.Modality] as WADORSMetaDataElement) as string) ||
      'ECG',
    manufacturer:
      (getValue(
        metadata[TAG.Manufacturer] as WADORSMetaDataElement
      ) as string) || undefined,
    institutionName:
      (getValue(
        metadata[TAG.InstitutionName] as WADORSMetaDataElement
      ) as string) || undefined,
  };
}

/**
 * Parses the DICOM WaveformSequence and returns an EcgModule object.
 *
 * @param metadata - The DICOM metadata object
 * @param wadoRsRoot - Optional WADO-RS root URL for BulkDataURI resolution
 * @param studyUID - Optional Study Instance UID for BulkDataURI path construction
 * @returns EcgModule object or null if no waveform data is found
 */
export function getECGModule(
  metadata: Record<string, unknown>,
  wadoRsRoot?: string,
  studyUID?: string
): EcgModule | null {
  const waveformSeqItems = getSequenceItems(metadata[TAG.WaveformSequence]);
  if (!waveformSeqItems || waveformSeqItems.length === 0) {
    return null;
  }

  const waveform = waveformSeqItems[0];

  const numberOfChannels = getNumberValue(
    waveform[TAG.NumberOfWaveformChannels]
  ) as number;
  const numberOfSamples = getNumberValue(
    waveform[TAG.NumberOfWaveformSamples]
  ) as number;
  const samplingFrequency = getNumberValue(
    waveform[TAG.SamplingFrequency]
  ) as number;
  const waveformBitsAllocated =
    getNumberValue(waveform[TAG.WaveformBitsAllocated]) ?? 16;
  const waveformSampleInterpretation =
    (getValue(waveform[TAG.WaveformSampleInterpretation]) as string) ?? 'SS';
  const multiplexGroupLabel =
    (getValue(waveform[TAG.MultiplexGroupLabel]) as string) ?? 'ECG';

  // Parse channel definitions
  const channelDefItems = getSequenceItems(
    waveform[TAG.ChannelDefinitionSequence]
  );
  const channelDefinitionSequence = (channelDefItems || []).map(
    (channelDef) => {
      const channelDefRecord = channelDef as unknown as Record<string, unknown>;
      const sourceSeqItems = getSequenceItems(
        channelDefRecord[TAG.ChannelSourceSequence]
      );
      const sourceSeq =
        (sourceSeqItems?.[0] as unknown as Record<string, unknown>) || {};
      const codeMeaning = getValue(
        sourceSeq[TAG.CodeMeaning] as WADORSMetaDataElement
      ) as string;

      return {
        channelSourceSequence: {
          codeMeaning: codeMeaning || 'Unknown',
        },
      };
    }
  );

  const waveformDataObj = waveform[TAG.WaveformData] || {};

  return {
    numberOfWaveformChannels: numberOfChannels,
    numberOfWaveformSamples: numberOfSamples,
    samplingFrequency,
    waveformBitsAllocated,
    waveformSampleInterpretation,
    multiplexGroupLabel,
    channelDefinitionSequence,
    waveformData: {
      retrieveBulkData: makeRetrieveBulkData(
        waveformDataObj,
        numberOfChannels,
        numberOfSamples,
        waveformBitsAllocated,
        waveformSampleInterpretation,
        wadoRsRoot,
        studyUID
      ),
    },
    annotations: parseRawAnnotations(metadata),
    patientInfo: parsePatientInfo(metadata),
    studyInfo: parseStudyInfo(metadata),
  };
}
