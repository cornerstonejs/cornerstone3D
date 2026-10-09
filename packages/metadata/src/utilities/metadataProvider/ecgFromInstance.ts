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

export interface EcgModuleFull {
  numberOfWaveformChannels: number;
  numberOfWaveformSamples: number;
  samplingFrequency: number;
  waveformBitsAllocated: number;
  waveformSampleInterpretation: string;
  multiplexGroupLabel: string;
  channelDefinitionSequence: Array<{
    channelSourceSequence?: { codeMeaning?: string };
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
function getChannelMvPerUnit(channel: Record<string, unknown>): number {
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
    return {
      channelSourceSequence: { codeMeaning },
      mvPerUnit: getChannelMvPerUnit(ch),
    };
  });

  let waveformDataRaw = group.WaveformData ?? group.waveformData;
  // A naturalized value can be a one-item array. A typed array is the data.
  if (Array.isArray(waveformDataRaw) && waveformDataRaw.length > 0) {
    waveformDataRaw = waveformDataRaw[0];
  }
  const waveformData = (waveformDataRaw as Record<string, unknown>) ?? {};
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
      const raw = base64ToUint8Array(waveformData.InlineBinary as string);
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
