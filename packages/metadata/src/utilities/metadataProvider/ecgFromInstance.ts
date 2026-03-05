/**
 * Builds the full ECG module (including waveformData.retrieveBulkData) from a
 * naturalized instance in INSTANCE_ORIG cache. Used by the typed provider so
 * ECGViewport can get data via metaData.get(MetadataModules.ECG, imageId)
 * without the legacy dicomImageLoader ECG provider.
 */

import { addTypedProvider } from '../../metaData';
import { MetadataModules } from '../../enums';
import type { TypedProvider } from '../../metaData';

const ECG_LOG = '[ecgFromInstance]';

export interface EcgModuleFull {
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
  return [];
}

function multipartDecode(response: ArrayBuffer): ArrayBuffer[] {
  const message = new Uint8Array(response);
  const separator = new TextEncoder().encode('\r\n\r\n');
  let offset = 0;
  const maxHeader = 1000;
  let headerEnd = -1;
  for (
    let i = 0;
    i < Math.min(message.length - separator.length, offset + maxHeader);
    i++
  ) {
    let found = true;
    for (let j = 0; j < separator.length; j++) {
      if (message[i + j] !== separator[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      headerEnd = i;
      break;
    }
  }
  if (headerEnd === -1) return [response];
  const headerStr = new TextDecoder().decode(message.slice(0, headerEnd));
  const boundaryMatch = headerStr.match(/boundary=([^\s;]+)/i);
  const boundary = boundaryMatch
    ? new TextEncoder().encode(`--${boundaryMatch[1].replace(/"/g, '').trim()}`)
    : null;
  if (!boundary) return [response];
  const dataStart = headerEnd + separator.length;
  const components: ArrayBuffer[] = [];
  let idx = message.indexOf(boundary[0], dataStart);
  while (idx !== -1) {
    const nextSep = message.indexOf(separator[0], idx);
    if (nextSep === -1) break;
    const partStart = nextSep + separator.length;
    const nextBound = message.indexOf(boundary[0], partStart);
    const partEnd = nextBound === -1 ? message.length : nextBound - 2;
    if (partEnd > partStart) {
      components.push(response.slice(partStart, partEnd));
    }
    if (nextBound === -1) break;
    idx = message.indexOf(boundary[0], nextBound + boundary.length);
  }
  return components.length > 0 ? components : [response];
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

/**
 * Build full EcgModule from a naturalized instance (UpperCamelCase convention).
 */
export function buildEcgModuleFromInstance(
  instance: Record<string, unknown>,
  imageId?: string
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
    return {
      channelSourceSequence: { codeMeaning },
    };
  });

  let waveformDataRaw = (group.WaveformData ?? group.waveformData) as
    | Record<string, unknown>
    | ArrayLike<Record<string, unknown>>
    | undefined;
  if (
    waveformDataRaw &&
    typeof (waveformDataRaw as ArrayLike<unknown>).length === 'number' &&
    (waveformDataRaw as ArrayLike<Record<string, unknown>>).length > 0
  ) {
    waveformDataRaw = (
      waveformDataRaw as ArrayLike<Record<string, unknown>>
    )[0];
  }
  const waveformData = (waveformDataRaw as Record<string, unknown>) ?? {};
  const { wadoRsRoot = undefined, studyUID = undefined } = imageId
    ? parseWadoRsImageId(imageId)
    : {};

  const retrieveBulkData = async (): Promise<Int16Array[]> => {
    // Binary file upload: AsyncDicomReader stores raw bytes as ArrayBuffer / TypedArray
    const wd = waveformData as unknown;
    if (
      wd instanceof ArrayBuffer ||
      (typeof ArrayBuffer !== 'undefined' &&
        ArrayBuffer.isView &&
        ArrayBuffer.isView(wd))
    ) {
      return convertBuffer(
        wd as ArrayBuffer | Uint8Array,
        numberOfChannels,
        numberOfSamples,
        bitsAllocated,
        sampleInterpretation
      );
    }
    if (waveformData.Value) return waveformData.Value as Int16Array[];
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
    if (
      typeof (
        waveformData as { retrieveBulkData?: () => Promise<Int16Array[]> }
      ).retrieveBulkData === 'function'
    ) {
      return (
        waveformData as { retrieveBulkData: () => Promise<Int16Array[]> }
      ).retrieveBulkData();
    }
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
    console.warn(
      '[ecgFromInstance] No waveform data source found. group keys:',
      Object.keys(group),
      'waveformData keys:',
      Object.keys(waveformData)
    );
    throw new Error('[ecgFromInstance] No waveform data source found');
  };

  return {
    numberOfWaveformChannels: numberOfChannels,
    numberOfWaveformSamples: numberOfSamples,
    samplingFrequency,
    waveformBitsAllocated: bitsAllocated,
    waveformSampleInterpretation: sampleInterpretation,
    multiplexGroupLabel,
    channelDefinitionSequence,
    waveformData: { retrieveBulkData },
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
  if (result) {
    console.log(ECG_LOG, 'ECG module built for imageId:', query);
  }
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
  const physicalDeltaY = 0.001;
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
        physicalUnitsXDirection: 4,
        physicalUnitsYDirection: -1,
        regionDataType: 1,
      },
    ],
  };
};

export function registerEcgFromInstanceProvider(): void {
  console.log(
    ECG_LOG,
    'Registering ECG-from-instance provider (ECG + CALIBRATION)'
  );
  addTypedProvider(MetadataModules.ECG, ecgFromInstanceProvider, {
    priority: ECG_FROM_INSTANCE_PRIORITY,
  });
  addTypedProvider(MetadataModules.CALIBRATION, ecgCalibrationProvider, {
    priority: ECG_FROM_INSTANCE_PRIORITY,
  });
}
