import { MetadataModules } from '../enums';
import * as metaData from '../metaData';
import type { TraceRegion } from '../RenderingEngine/GenericViewport/ECG/ECGViewportTypes';

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

export const STANDARD_12_LEADS = [
  'I',
  'II',
  'III',
  'aVR',
  'aVL',
  'aVF',
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
] as const;

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

/**
 * Loads an ECG waveform dataset from metadata and retrieves the channel data arrays.
 *
 * @param dataId - The unique data ID / image ID for the ECG dataset
 * @returns Object containing the parsed waveform data and calibration metadata
 */
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
    const rawName =
      channelDefinition.channelSourceSequence?.codeMeaning ||
      channelDefinition.ChannelSourceSequence?.CodeMeaning ||
      '';
    const cleanName = rawName
      .replace(/^Lead\s+/i, '')
      .replace(/\s*\([^)]*\)/g, '')
      .trim();

    const name =
      cleanName ||
      (index < STANDARD_12_LEADS.length ? STANDARD_12_LEADS[index] : '') ||
      `${index + 1}`;
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

/**
 * Computes the visible sample range [startIndex, endIndex] and time range [startMs, endMs]
 * for the given waveform and camera time range.
 *
 * @param waveform - Waveform metadata and sample parameters
 * @param camera - Current ECG camera/view state containing timeRange
 * @returns Object with calculated time boundaries and sample indices
 */
export function computeECGTimeWindow(
  waveform: { numberOfSamples: number; samplingFrequency?: number },
  camera?: { timeRange?: [number, number] }
): {
  startMs: number;
  endMs: number;
  startIndex: number;
  endIndex: number;
} {
  const samplingFrequency = Math.max(1, waveform?.samplingFrequency || 1000);
  const numberOfSamples = Math.max(1, waveform?.numberOfSamples ?? 5000);
  const durationMs = (numberOfSamples / samplingFrequency) * 1000;
  const startMs = Math.max(
    0,
    Math.min(camera?.timeRange?.[0] ?? 0, durationMs)
  );
  const requestedEnd = Math.max(
    startMs + 1,
    camera?.timeRange?.[1] ?? durationMs
  );
  const endMs = Math.max(startMs + 1, Math.min(requestedEnd, durationMs));
  const startIndex = Math.max(
    0,
    Math.min(
      numberOfSamples - 1,
      Math.floor((startMs / 1000) * samplingFrequency)
    )
  );
  const endIndex = Math.max(
    startIndex + 1,
    Math.min(numberOfSamples, Math.ceil((endMs / 1000) * samplingFrequency))
  );

  return {
    startMs,
    endMs,
    startIndex,
    endIndex,
  };
}

/**
 * Computes the sample index range [segStartIndex, segEndIndex] for a trace region,
 * taking into account explicit timeWindow boundaries or proportional bounds within
 * the active viewport window.
 *
 * @param args - Calculation parameters including region, channel length, and timeline window bounds
 * @returns Object with segStartIndex and segEndIndex
 */
export function computeECGRegionSampleRange(args: {
  region: TraceRegion;
  channelDataLength: number;
  effectiveStart: number;
  effectiveEnd: number;
}): {
  segStartIndex: number;
  segEndIndex: number;
} {
  const { region, channelDataLength, effectiveStart, effectiveEnd } = args;
  const windowSpan = Math.max(1, effectiveEnd - effectiveStart);
  const minX = region.bounds?.minX ?? 0;
  const maxX = region.bounds?.maxX ?? 1;

  if (region.timeWindow && region.timeWindow.length === 2) {
    const segStartIndex = Math.max(
      effectiveStart,
      Math.min(channelDataLength, region.timeWindow[0])
    );
    const segEndIndex = Math.max(
      segStartIndex,
      Math.min(effectiveEnd, channelDataLength, region.timeWindow[1])
    );
    return { segStartIndex, segEndIndex };
  }

  const segStartIndex = Math.max(
    0,
    Math.floor(effectiveStart + minX * windowSpan)
  );
  const segEndIndex = Math.min(
    channelDataLength,
    Math.ceil(effectiveStart + maxX * windowSpan)
  );

  return { segStartIndex, segEndIndex };
}

/**
 * Computes rendering metrics (dimensions, channel scaling, and world-to-canvas ratio)
 * for an ECG viewport based on canvas size, visible channels, and layout regions.
 *
 * @param args - Metric calculation parameters including canvas, channels, window, and traceRegions
 * @returns Computed ECGRenderMetrics object
 */
export function computeECGRenderMetrics<TChannel extends ECGChannelLike>(args: {
  canvas: HTMLCanvasElement;
  visibleChannels: TChannel[];
  windowMs: number;
  valueRange: [number, number];
  traceRegions?: TraceRegion[];
}): ECGRenderMetrics {
  const { canvas, visibleChannels, windowMs, valueRange, traceRegions } = args;
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

  const hasRegions = traceRegions && traceRegions.length > 0;
  let rowCount = Math.max(1, visibleChannels.length);

  if (hasRegions) {
    const minSlotHeight = Math.min(
      ...traceRegions.map((r) => {
        const leadCount = Math.max(1, r.leadIndices?.length || 1);
        const regionHeight = (r.bounds?.maxY ?? 1) - (r.bounds?.minY ?? 0);
        return Math.max(1e-4, regionHeight / leadCount);
      })
    );
    rowCount = Math.max(1, Math.round(1 / minSlotHeight));
  }

  const totalSpacing = ECG_CHANNEL_SPACING * rowCount;
  const heightPerChannel = (targetTotalHeight - totalSpacing) / rowCount;
  const channelScale = heightPerChannel / (range * 1.25);
  const ecgHeight = hasRegions
    ? targetTotalHeight
    : computeECGHeight(visibleChannels, channelScale);

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

/**
 * Renders ECG waveform traces and baselines onto a 2D canvas context, supporting
 * both continuous stacked channel layouts and segmented multi-lead trace regions.
 *
 * @param args - Drawing parameters including canvas context, layout configuration, metrics, and traceRegions
 */
export function drawECGTraces<TChannel extends ECGChannelLike>(args: {
  ctx: CanvasRenderingContext2D;
  layouts: ECGChannelLayout<TChannel>[];
  ecgWidth: number;
  ecgHeight?: number;
  channelScale: number;
  startIndex?: number;
  endIndex?: number;
  lineWidth?: number;
  amplitudeScale?: number;
  traceRegions?: TraceRegion[];
  channels?: TChannel[];
  numberOfSamples?: number;
  visibleChannels?: number[];
}): void {
  const {
    ctx,
    layouts,
    ecgWidth,
    ecgHeight = 1,
    channelScale,
    startIndex = 0,
    endIndex,
    lineWidth = 1,
    amplitudeScale = 1,
    traceRegions,
    channels,
    numberOfSamples,
    visibleChannels,
  } = args;

  if (
    traceRegions &&
    traceRegions.length > 0 &&
    channels &&
    channels.length > 0
  ) {
    const totalSamples = numberOfSamples ?? channels[0]?.data?.length ?? 5000;
    const effectiveStart = startIndex ?? 0;
    const effectiveEnd = endIndex ?? totalSamples;
    const windowSpan = Math.max(1, effectiveEnd - effectiveStart);
    const visibleChannelsSet = visibleChannels
      ? new Set(visibleChannels)
      : null;

    traceRegions.forEach((region, regionIndex) => {
      const leadIndices = region.leadIndices?.length
        ? region.leadIndices
        : [regionIndex];
      const leadCount = leadIndices.length;

      const minX = region.bounds?.minX ?? 0;
      const maxX = region.bounds?.maxX ?? 1;
      const totalMinY = region.bounds?.minY ?? 0;
      const totalMaxY = region.bounds?.maxY ?? 1;
      const slotHeight = (totalMaxY - totalMinY) / leadCount;

      const startX = minX * ecgWidth;
      const endX = maxX * ecgWidth;
      const spanWidth = Math.max(1, endX - startX);

      leadIndices.forEach((channelIdx, leadOffset) => {
        if (visibleChannelsSet && !visibleChannelsSet.has(channelIdx)) {
          return;
        }

        const channel = channels[channelIdx];
        if (!channel || !channel.data.length) {
          return;
        }

        const minY = totalMinY + leadOffset * slotHeight;
        const maxY = minY + slotHeight;
        const baseline = ((minY + maxY) / 2) * ecgHeight;

        const { segStartIndex, segEndIndex } = computeECGRegionSampleRange({
          region,
          channelDataLength: channel.data.length,
          effectiveStart,
          effectiveEnd,
        });
        const sampleCount = Math.max(1, segEndIndex - segStartIndex);

        ctx.strokeStyle = ECG_RENDERING_COLORS.baseline;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(startX, baseline);
        ctx.lineTo(endX, baseline);
        ctx.stroke();

        ctx.strokeStyle = ECG_RENDERING_COLORS.trace;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();

        for (let index = segStartIndex; index < segEndIndex; index++) {
          const x =
            startX + ((index - segStartIndex) * spanWidth) / sampleCount;
          const y =
            baseline - channel.data[index] * channelScale * amplitudeScale;

          if (index === segStartIndex) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();
      });
    });
    return;
  }

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
