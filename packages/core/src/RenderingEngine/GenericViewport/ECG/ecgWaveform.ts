import { utilities as metadataUtilities } from '@cornerstonejs/metadata';
import { MetadataModules } from '../../../enums';
import * as metaData from '../../../metaData';

/** Default ECG paper speed: 25 mm/s */
export const ECG_DEFAULT_SWEEP_SPEED_MM_S = 25;
/** Default ECG amplitude calibration: 10 mm/mV */
export const ECG_DEFAULT_SENSITIVITY_MM_MV = 10;
/** Pixels per mm at 1:1 scale (96 DPI nominal; governs grid density) */
export const ECG_PX_PER_MM = 3.779;
/** World pixels for each second in the deprecated ECG viewport. */
export const ECG_SECONDS_WIDTH = 150;
/** World pixels between two bands of a trace layout. */
export const ECG_CHANNEL_SPACING = 5;

/**
 * Millivolts that one raw sample unit represents when the instance carries no
 * channel sensitivity. A 16-bit diagnostic ECG normally samples at 1 microvolt
 * for each unit.
 */
export const ECG_DEFAULT_MV_PER_UNIT =
  metadataUtilities.ECG_DEFAULT_MV_PER_UNIT;

export const ECG_RENDERING_COLORS = {
  gridMajor: '#7f0000',
  gridMinor: '#3f0000',
  baseline: '#7f4c00',
  trace: '#ffffff',
  label: '#ffff00',
  background: '#000000',
} as const;

export interface ECGChannelLike {
  name: string;
  /**
   * Code value of the lead, from `ChannelSourceSequence`, for example
   * `5.6.3-9-2` (SCPECG) or `2:2` (MDC) for lead II. A trace layout names a
   * lead by this value, because the code meaning depends on the language.
   */
  code?: string;
  data: Int16Array;
  min: number;
  max: number;
  visible?: boolean;
  /**
   * Millivolts that one raw sample unit of this channel represents. The value
   * comes from the DICOM channel sensitivity. It is `ECG_DEFAULT_MV_PER_UNIT`
   * when the instance omits the sensitivity.
   */
  mvPerUnit?: number;
}

export interface ECGWaveformLike<
  TChannel extends ECGChannelLike = ECGChannelLike,
> {
  channels: TChannel[];
  numberOfChannels: number;
  numberOfSamples: number;
  samplingFrequency: number;
  bitsAllocated: number;
  sampleInterpretation: string;
  multiplexGroupLabel?: string;
  calibration?: unknown;
}

/** Millivolts for each raw sample unit of one channel. */
export function getECGChannelMvPerUnit(channel: {
  mvPerUnit?: number;
}): number {
  return Number.isFinite(channel.mvPerUnit) && channel.mvPerUnit > 0
    ? channel.mvPerUnit
    : ECG_DEFAULT_MV_PER_UNIT;
}

export async function loadECGWaveform(dataId: string): Promise<{
  waveform: ECGWaveformLike;
  calibration: unknown;
}> {
  const ecgModule = metaData.get(MetadataModules.ECG, dataId);

  if (!ecgModule?.waveformData?.retrieveBulkData) {
    throw new Error(`[ECG] No ECG waveform data for ${dataId}`);
  }

  const {
    numberOfWaveformChannels: numberOfChannels,
    numberOfWaveformSamples: numberOfSamples,
    samplingFrequency,
    waveformBitsAllocated: bitsAllocated = 16,
    waveformSampleInterpretation: sampleInterpretation = 'SS',
    multiplexGroupLabel,
    channelDefinitionSequence: channelDefinitions = [],
  } = ecgModule;

  const channelArrays: Int16Array[] =
    await ecgModule.waveformData.retrieveBulkData();
  const calibration = metaData.get(MetadataModules.CALIBRATION, dataId);
  const channels: ECGChannelLike[] = [];

  for (let index = 0; index < numberOfChannels; index++) {
    const channelDefinition = channelDefinitions[index] || {};
    const source = channelDefinition.channelSourceSequence;
    const data = channelArrays[index] || new Int16Array(0);
    const { min, max } = computeECGMinMax(data);

    channels.push({
      name: source?.codeMeaning || `Channel ${index + 1}`,
      code: source?.codeValue,
      data,
      min,
      max,
      mvPerUnit: getECGChannelMvPerUnit(channelDefinition),
    });
  }

  return {
    waveform: {
      channels,
      numberOfChannels,
      numberOfSamples,
      samplingFrequency,
      bitsAllocated,
      sampleInterpretation,
      multiplexGroupLabel,
      calibration,
    },
    calibration,
  };
}

export function computeECGMinMax(data: Int16Array): {
  min: number;
  max: number;
} {
  let min = 0;
  let max = 0;

  for (let index = 0; index < data.length; index++) {
    if (data[index] < min) {
      min = data[index];
    }
    if (data[index] > max) {
      max = data[index];
    }
  }

  return { min, max };
}

export function getDefaultECGValueRange(
  waveform: ECGWaveformLike
): [number, number] {
  let min = 0;
  let max = 0;

  waveform.channels.forEach((channel) => {
    min = Math.min(min, channel.min);
    max = Math.max(max, channel.max);
  });

  if (min === max) {
    return [-1, 1];
  }

  return [min, max];
}
