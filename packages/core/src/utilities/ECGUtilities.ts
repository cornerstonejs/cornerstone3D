import { MetadataModules } from '../enums';
import * as metaData from '../metaData';

export const ECG_SECONDS_WIDTH = 150;
export const ECG_CHANNEL_SPACING = 5;

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
  data: Int16Array;
  min: number;
  max: number;
  visible?: boolean;
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

export interface ECGChannelLayout<
  TChannel extends ECGChannelLike = ECGChannelLike,
> {
  channel: TChannel;
  itemHeight: number;
  yOffset: number;
  baseline: number;
}

export interface ECGRenderMetrics {
  ecgWidth: number;
  ecgHeight: number;
  channelScale: number;
  worldToCanvasRatio: number;
  xOffsetCanvas: number;
  yOffsetCanvas: number;
}

export interface ECGGridMetrics {
  ecgWidth: number;
  ecgHeight: number;
  channelScale: number;
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
    const name =
      channelDefinition.channelSourceSequence?.codeMeaning ||
      channelDefinition.ChannelSourceSequence?.CodeMeaning ||
      `Channel ${index + 1}`;
    const data = channelArrays[index] || new Int16Array(0);
    const { min, max } = computeECGMinMax(data);

    channels.push({
      name,
      data,
      min,
      max,
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

export function getVisibleECGChannels<TChannel extends ECGChannelLike>(
  channels: TChannel[],
  visibleChannels?: number[]
): TChannel[] {
  if (!visibleChannels) {
    return channels.filter((channel) => channel.data.length > 0);
  }

  const visible = new Set(visibleChannels);

  return channels.filter(
    (_channel, index) => visible.has(index) && channels[index].data.length > 0
  );
}

export function getVisibleECGChannelsByFlag<TChannel extends ECGChannelLike>(
  channels: TChannel[]
): TChannel[] {
  return channels.filter(
    (channel) => channel.visible !== false && channel.data.length > 0
  );
}

export function computeECGHeight<TChannel extends ECGChannelLike>(
  visibleChannels: TChannel[],
  channelScale: number
): number {
  let totalHeight = 0;

  visibleChannels.forEach((channel) => {
    totalHeight += (channel.max - channel.min) * channelScale * 1.25;
    totalHeight += ECG_CHANNEL_SPACING;
  });

  return totalHeight || 1;
}

export function computeECGChannelLayouts<
  TChannel extends ECGChannelLike,
>(args: {
  visibleChannels: TChannel[];
  channelScale: number;
}): ECGChannelLayout<TChannel>[] {
  const { visibleChannels, channelScale } = args;
  const layouts: ECGChannelLayout<TChannel>[] = [];
  let yOffset = 0;

  visibleChannels.forEach((channel) => {
    const itemHeight = (channel.max - channel.min) * channelScale * 1.25;
    yOffset += itemHeight + ECG_CHANNEL_SPACING;
    const baseline = yOffset + channel.min * channelScale;
    layouts.push({
      channel,
      itemHeight,
      yOffset,
      baseline,
    });
  });

  return layouts;
}

export function computeECGRenderMetrics<TChannel extends ECGChannelLike>(args: {
  canvas: HTMLCanvasElement;
  visibleChannels: TChannel[];
  windowMs: number;
  valueRange: [number, number];
}): ECGRenderMetrics {
  const { canvas, visibleChannels, windowMs, valueRange } = args;
  const ecgWidth = Math.max(
    1,
    Math.ceil((windowMs / 1000) * ECG_SECONDS_WIDTH)
  );
  const [minValue, maxValue] = valueRange;
  const range = Math.max(1, maxValue - minValue);
  const canvasAspect =
    canvas.clientHeight && canvas.clientWidth
      ? canvas.clientHeight / canvas.clientWidth
      : 2 / 3;
  const targetTotalHeight = ecgWidth * canvasAspect;
  const totalSpacing =
    ECG_CHANNEL_SPACING * Math.max(1, visibleChannels.length);
  const heightPerChannel =
    (targetTotalHeight - totalSpacing) / Math.max(1, visibleChannels.length);
  const channelScale = heightPerChannel / (range * 1.25);
  const ecgHeight = computeECGHeight(visibleChannels, channelScale);
  const worldToCanvasRatio = Math.min(
    canvas.clientWidth / Math.max(1, ecgWidth),
    canvas.clientHeight / Math.max(1, ecgHeight)
  );
  const drawWidth = ecgWidth * worldToCanvasRatio;
  const drawHeight = ecgHeight * worldToCanvasRatio;

  return {
    ecgWidth,
    ecgHeight,
    channelScale,
    worldToCanvasRatio,
    xOffsetCanvas: (canvas.clientWidth - drawWidth) / 2,
    yOffsetCanvas: (canvas.clientHeight - drawHeight) / 2,
  };
}

export function drawECGGrid(
  ctx: CanvasRenderingContext2D,
  metrics: ECGGridMetrics,
  options?: { showGrid?: boolean }
): void {
  if (options?.showGrid === false || metrics.channelScale <= 0) {
    return;
  }

  const { ecgWidth, ecgHeight, channelScale } = metrics;
  const minLineSpacing = 8;
  let horizontalGridUnit = 100;

  while (horizontalGridUnit * channelScale < minLineSpacing) {
    horizontalGridUnit *= 2;
  }

  const minorH = horizontalGridUnit * channelScale;
  const majorH = minorH * 5;
  const minorV = ECG_SECONDS_WIDTH / 25;
  const majorV = ECG_SECONDS_WIDTH / 5;

  ctx.strokeStyle = ECG_RENDERING_COLORS.gridMinor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();

  for (let y = minorH; y <= ecgHeight; y += minorH) {
    if (Math.round(y / minorH) % 5 !== 0) {
      ctx.moveTo(0, y);
      ctx.lineTo(ecgWidth, y);
    }
  }

  for (let x = minorV; x <= ecgWidth; x += minorV) {
    if (Math.round(x / minorV) % 5 !== 0) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ecgHeight);
    }
  }

  ctx.stroke();

  ctx.strokeStyle = ECG_RENDERING_COLORS.gridMajor;
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let y = majorH; y <= ecgHeight; y += majorH) {
    ctx.moveTo(0, y);
    ctx.lineTo(ecgWidth, y);
  }

  for (let x = majorV; x <= ecgWidth; x += majorV) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ecgHeight);
  }

  ctx.stroke();
}

export function drawECGTraces<TChannel extends ECGChannelLike>(args: {
  ctx: CanvasRenderingContext2D;
  layouts: ECGChannelLayout<TChannel>[];
  ecgWidth: number;
  channelScale: number;
  startIndex?: number;
  endIndex?: number;
  lineWidth?: number;
  amplitudeScale?: number;
}): void {
  const {
    ctx,
    layouts,
    ecgWidth,
    channelScale,
    startIndex = 0,
    endIndex,
    lineWidth = 1,
    amplitudeScale = 1,
  } = args;

  layouts.forEach(({ channel, baseline }) => {
    const resolvedEndIndex = Math.min(
      endIndex ?? channel.data.length,
      channel.data.length
    );
    const resolvedStartIndex = Math.max(
      0,
      Math.min(startIndex, resolvedEndIndex - 1)
    );
    const sampleCount = Math.max(1, resolvedEndIndex - resolvedStartIndex);

    ctx.strokeStyle = ECG_RENDERING_COLORS.baseline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, baseline);
    ctx.lineTo(ecgWidth, baseline);
    ctx.stroke();

    ctx.strokeStyle = ECG_RENDERING_COLORS.trace;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    for (let index = resolvedStartIndex; index < resolvedEndIndex; index++) {
      const x = ((index - resolvedStartIndex) * ecgWidth) / sampleCount;
      const y = baseline - channel.data[index] * channelScale * amplitudeScale;

      if (index === resolvedStartIndex) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  });
}

export function drawECGLabels<TChannel extends ECGChannelLike>(
  ctx: CanvasRenderingContext2D,
  layouts: ECGChannelLayout<TChannel>[],
  worldToCanvasRatio: number
): void {
  const fontSize = 14 / (worldToCanvasRatio || 1);

  layouts.forEach(({ channel, itemHeight, yOffset }) => {
    const labelY = yOffset - itemHeight + fontSize;

    ctx.font = `${fontSize}px monospace`;
    const textWidth = ctx.measureText(channel.name).width;
    ctx.fillStyle = ECG_RENDERING_COLORS.background;
    ctx.fillRect(5, labelY - fontSize, textWidth + 4, fontSize + 4);
    ctx.fillStyle = ECG_RENDERING_COLORS.label;
    ctx.fillText(channel.name, 5, labelY);
  });
}

export function ensureECGCanvasSize(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, canvas.clientWidth || canvas.width || 1);
  const height = Math.max(1, canvas.clientHeight || canvas.height || 1);
  const nextWidth = Math.floor(width * dpr);
  const nextHeight = Math.floor(height * dpr);

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
}
