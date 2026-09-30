import { MetadataModules } from '../enums';
import * as metaData from '../metaData';

/** Default ECG paper speed: 25 mm/s */
export const ECG_DEFAULT_SWEEP_SPEED_MM_S = 25;
/** Default ECG amplitude calibration: 10 mm/mV */
export const ECG_DEFAULT_SENSITIVITY_MM_MV = 10;
/** Pixels per mm at 1:1 scale (96 DPI nominal; governs grid density) */
export const ECG_PX_PER_MM = 3.779;

/** @deprecated Use ECG_DEFAULT_SWEEP_SPEED_MM_S and ECG_PX_PER_MM to compute dynamically. */
export const ECG_SECONDS_WIDTH = 150;
export const ECG_CHANNEL_SPACING = 5;
/**
 * Millivolts that one raw sample unit represents when the instance carries no
 * channel sensitivity. A 16-bit diagnostic ECG normally samples at 1 microvolt
 * for each unit.
 */
export const ECG_DEFAULT_MV_PER_UNIT = 0.001;

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
  /**
   * Millivolts that one raw sample unit of this channel represents. The value
   * comes from the DICOM channel sensitivity. It is `ECG_DEFAULT_MV_PER_UNIT`
   * when the instance omits the sensitivity.
   */
  mvPerUnit?: number;
}

/**
 * Returns the millivolts that one raw sample unit represents for a set of
 * channels. The function reads the first channel that carries the value,
 * because a multiplex group shares one sensitivity in practice.
 */
export function getECGMvPerUnit<TChannel extends ECGChannelLike>(
  channels: TChannel[]
): number {
  for (const channel of channels) {
    if (Number.isFinite(channel.mvPerUnit) && channel.mvPerUnit > 0) {
      return channel.mvPerUnit;
    }
  }

  return ECG_DEFAULT_MV_PER_UNIT;
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

/** Arrangement of the ECG leads on the canvas. */
export type ECGLayoutType = '12x1' | '6x2' | '3x4' | '3x4+1';

export interface ECGChannelLayout<
  TChannel extends ECGChannelLike = ECGChannelLike,
> {
  channel: TChannel;
  itemHeight: number;
  yOffset: number;
  baseline: number;
  xOffset?: number;
  width?: number;
  startSample?: number;
  endSample?: number;
  col?: number;
  row?: number;
  /**
   * Stable identifier of the layout cell, and the Z component of the ECG world
   * point. A grid cell uses the index of the channel in the unfiltered channel
   * list, so the identifier does not change when the user hides another lead or
   * selects another layout. A rhythm strip repeats a lead that a grid cell
   * already shows, so the rhythm strip gets its own synthetic identifier above
   * the last channel index. The identifier is therefore unique in one layout,
   * and `worldToCanvas` can select one cell without ambiguity.
   */
  leadIndex?: number;
  isRhythm?: boolean;
}

/** A visible channel together with its index in the unfiltered channel list. */
export interface ECGVisibleChannelEntry<
  TChannel extends ECGChannelLike = ECGChannelLike,
> {
  channel: TChannel;
  channelIndex: number;
}

export interface ECGRenderMetrics {
  ecgWidth: number;
  ecgHeight: number;
  channelScale: number;
  worldToCanvasRatio: number;
  xOffsetCanvas: number;
  yOffsetCanvas: number;
  /**
   * World pixels that one second of signal occupies. `drawECGGrid` needs this
   * value to place the vertical grid lines, because the world width already
   * encodes the sweep speed.
   */
  pxPerSecond: number;
  /** Sweep speed in mm/s that produced `pxPerSecond`. */
  sweepSpeed: number;
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
      mvPerUnit:
        Number.isFinite(channelDefinition.mvPerUnit) &&
        channelDefinition.mvPerUnit > 0
          ? channelDefinition.mvPerUnit
          : ECG_DEFAULT_MV_PER_UNIT,
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

/**
 * Returns the visible channels together with the index of each channel in the
 * unfiltered channel list. The caller passes those indices to
 * {@link computeECGChannelLayouts} as `leadIndices`, so a layout cell keeps the
 * same identifier when the user hides another lead.
 *
 * The filter rule matches {@link getVisibleECGChannels}.
 */
export function getVisibleECGChannelEntries<TChannel extends ECGChannelLike>(
  channels: TChannel[],
  visibleChannels?: number[]
): ECGVisibleChannelEntry<TChannel>[] {
  const visible = visibleChannels ? new Set(visibleChannels) : undefined;
  const entries: ECGVisibleChannelEntry<TChannel>[] = [];

  channels.forEach((channel, channelIndex) => {
    if (channel.data.length === 0) {
      return;
    }

    if (visible && !visible.has(channelIndex)) {
      return;
    }

    entries.push({ channel, channelIndex });
  });

  return entries;
}

/** Rows that one column of a layout holds before the next column starts. */
const ECG_LAYOUT_ROWS_PER_COLUMN: Record<ECGLayoutType, number> = {
  '12x1': Number.POSITIVE_INFINITY,
  '6x2': 6,
  '3x4': 3,
  '3x4+1': 3,
};

/** Number of columns that a layout holds when every lead fits in the grid. */
const ECG_LAYOUT_NOMINAL_COLUMNS: Record<ECGLayoutType, number> = {
  '12x1': 1,
  '6x2': 2,
  '3x4': 4,
  '3x4+1': 4,
};

/** Number of rows that a layout holds when every lead fits in the grid. */
const ECG_LAYOUT_NOMINAL_ROWS: Record<ECGLayoutType, number> = {
  '12x1': 12,
  '6x2': 6,
  '3x4': 3,
  '3x4+1': 4,
};

/**
 * Returns the number of rows that a layout uses for a given count of visible
 * leads. The grid grows above the nominal size when the waveform holds more
 * leads than the nominal layout holds.
 */
export function getECGLayoutRowCount(
  layoutType: ECGLayoutType,
  visibleCount: number
): number {
  const rowsPerColumn = ECG_LAYOUT_ROWS_PER_COLUMN[layoutType];
  const gridRows = Number.isFinite(rowsPerColumn)
    ? rowsPerColumn
    : Math.max(1, visibleCount);

  return Math.max(
    ECG_LAYOUT_NOMINAL_ROWS[layoutType],
    layoutType === '3x4+1' ? gridRows + 1 : gridRows
  );
}

interface ECGLayoutItem<TChannel extends ECGChannelLike> {
  channel: TChannel;
  row: number;
  col: number;
  leadIndex: number;
  isRhythm: boolean;
}

interface ECGLayoutGrid<TChannel extends ECGChannelLike> {
  rowCount: number;
  colCount: number;
  items: ECGLayoutItem<TChannel>[];
  rowHeights: number[];
  rowYOffsets: number[];
  rowBaselines: number[];
  totalHeight: number;
}

/**
 * Selects the position of the rhythm lead in the visible channel list.
 *
 * The rule prefers lead II, and the pattern `\bii\b` does not match lead III.
 * The rule falls back to the second visible channel, and then to the first one.
 * {@link computeECGHeight} and {@link computeECGChannelLayouts} both call this
 * function, so the reserved height and the drawn layout always agree.
 */
function getECGRhythmPosition<TChannel extends ECGChannelLike>(
  visibleChannels: TChannel[]
): number {
  const named = visibleChannels.findIndex((channel) =>
    /\bii\b/.test((channel.name ?? '').toLowerCase())
  );

  if (named >= 0) {
    return named;
  }

  return visibleChannels.length > 1 ? 1 : 0;
}

/**
 * Computes the shared row geometry of an ECG layout: the grid size, the layout
 * items, the row heights, the row offsets and the total height.
 *
 * The grid grows when the waveform holds more leads than the nominal layout, so
 * a 15-lead ECG keeps every lead. The nominal layout stays the minimum size, so
 * a 12-lead ECG in the `12x1` layout still reserves 12 rows.
 */
function computeECGLayoutGrid<TChannel extends ECGChannelLike>(args: {
  visibleChannels: TChannel[];
  channelScale: number;
  layoutType: ECGLayoutType;
  leadIndices?: number[];
  channelCount?: number;
}): ECGLayoutGrid<TChannel> {
  const {
    visibleChannels,
    channelScale,
    layoutType,
    leadIndices,
    channelCount,
  } = args;
  const rowsPerColumn = ECG_LAYOUT_ROWS_PER_COLUMN[layoutType];
  const visibleCount = visibleChannels.length;
  const usedColumns = Number.isFinite(rowsPerColumn)
    ? Math.ceil(visibleCount / rowsPerColumn)
    : 1;
  const colCount = Math.max(
    ECG_LAYOUT_NOMINAL_COLUMNS[layoutType],
    usedColumns
  );
  const rowCount = getECGLayoutRowCount(layoutType, visibleCount);

  // A grid cell keeps the index of its channel in the unfiltered channel list,
  // so the identifier survives a change of the visible leads or of the layout.
  const resolvedLeadIndices =
    leadIndices ?? visibleChannels.map((_channel, index) => index);
  const items: ECGLayoutItem<TChannel>[] = [];

  visibleChannels.forEach((channel, index) => {
    const row = Number.isFinite(rowsPerColumn) ? index % rowsPerColumn : index;
    const col = Number.isFinite(rowsPerColumn)
      ? Math.floor(index / rowsPerColumn)
      : 0;

    items.push({
      channel,
      row,
      col,
      leadIndex: resolvedLeadIndices[index] ?? index,
      isRhythm: false,
    });
  });

  if (layoutType === '3x4+1' && visibleCount > 0) {
    // The rhythm strip repeats a lead that a grid cell already shows, so it
    // takes its own identifier above the last channel index. Without the
    // separate identifier, `worldToCanvas` cannot tell the two cells apart.
    const rhythmPosition = getECGRhythmPosition(visibleChannels);
    const lastLeadIndex = resolvedLeadIndices.reduce(
      (highest, leadIndex) => Math.max(highest, leadIndex),
      -1
    );

    items.push({
      channel: visibleChannels[rhythmPosition],
      row: rowCount - 1,
      col: 0,
      leadIndex: channelCount ?? lastLeadIndex + 1,
      isRhythm: true,
    });
  }

  const rowHeights = new Array(rowCount).fill(0);
  items.forEach(({ channel, row }) => {
    const itemHeight = (channel.max - channel.min) * channelScale * 1.25;
    if (itemHeight > rowHeights[row]) {
      rowHeights[row] = itemHeight;
    }
  });

  const rowYOffsets = new Array(rowCount).fill(0);
  const rowBaselines = new Array(rowCount).fill(0);
  const defaultEmptyRowHeight = 100 * channelScale * 1.25;
  let currentYOffset = 0;

  for (let r = 0; r < rowCount; r++) {
    const rowHeight = rowHeights[r] || defaultEmptyRowHeight;
    currentYOffset += rowHeight + ECG_CHANNEL_SPACING;
    rowYOffsets[r] = currentYOffset;

    const rowItem = items.find((item) => item.row === r);
    const minVal = rowItem ? rowItem.channel.min : 0;
    rowBaselines[r] = currentYOffset + minVal * channelScale;
  }

  return {
    rowCount,
    colCount,
    items,
    rowHeights,
    rowYOffsets,
    rowBaselines,
    totalHeight: currentYOffset,
  };
}

/**
 * Returns the total world height of the ECG layout.
 *
 * The function derives the height from {@link computeECGLayoutGrid}, which
 * {@link computeECGChannelLayouts} also uses. The reserved height and the drawn
 * layout therefore always agree, including the choice of the rhythm lead.
 */
export function computeECGHeight<TChannel extends ECGChannelLike>(
  visibleChannels: TChannel[],
  channelScale: number,
  layoutType: ECGLayoutType = '12x1'
): number {
  if (visibleChannels.length === 0) {
    return 1;
  }

  const grid = computeECGLayoutGrid({
    visibleChannels,
    channelScale,
    layoutType,
  });

  return grid.totalHeight || 1;
}

export function computeECGChannelLayouts<
  TChannel extends ECGChannelLike,
>(args: {
  visibleChannels: TChannel[];
  channelScale: number;
  layoutType?: ECGLayoutType;
  numberOfSamples?: number;
  ecgWidth?: number;
  /**
   * Index of each visible channel in the unfiltered channel list. The layout
   * writes these indices to `leadIndex`. When the caller omits the argument,
   * the layout uses the position in `visibleChannels`.
   */
  leadIndices?: number[];
  /**
   * Length of the unfiltered channel list. The `3x4+1` rhythm strip takes this
   * value as its synthetic `leadIndex`.
   */
  channelCount?: number;
}): ECGChannelLayout<TChannel>[] {
  const {
    visibleChannels,
    channelScale,
    layoutType = '12x1',
    numberOfSamples = 5000,
    ecgWidth = 1000,
    leadIndices,
    channelCount,
  } = args;

  const grid = computeECGLayoutGrid({
    visibleChannels,
    channelScale,
    layoutType,
    leadIndices,
    channelCount,
  });
  const layouts: ECGChannelLayout<TChannel>[] = [];

  grid.items.forEach(({ channel, row, col, leadIndex, isRhythm }) => {
    let startSample = 0;
    let endSample = numberOfSamples;
    let width = ecgWidth;
    let xOffset = 0;

    // A grid cell of a multi-column layout shows one time segment of the
    // signal. The rhythm strip and the `12x1` rows show the full duration.
    if (layoutType !== '12x1' && !isRhythm) {
      const segmentDuration = numberOfSamples / grid.colCount;
      startSample = Math.floor(col * segmentDuration);
      endSample = Math.floor((col + 1) * segmentDuration);
      width = ecgWidth / grid.colCount;
      xOffset = col * width;
    }

    layouts.push({
      channel,
      itemHeight: grid.rowHeights[row],
      yOffset: grid.rowYOffsets[row],
      baseline: grid.rowBaselines[row],
      xOffset,
      width,
      startSample,
      endSample,
      col,
      row,
      leadIndex,
      isRhythm,
    });
  });

  return layouts;
}

export function computeECGRenderMetrics<TChannel extends ECGChannelLike>(args: {
  canvas: HTMLCanvasElement;
  visibleChannels: TChannel[];
  windowMs: number;
  valueRange: [number, number];
  /**
   * Horizontal sweep speed in mm/s. Defaults to `ECG_DEFAULT_SWEEP_SPEED_MM_S` (25 mm/s).
   * Controls how wide one second of signal is rendered.
   */
  sweepSpeed?: number;
  /**
   * Amplitude sensitivity in mm/mV. Defaults to `ECG_DEFAULT_SENSITIVITY_MM_MV` (10 mm/mV).
   * Controls how tall one millivolt of signal is rendered.
   */
  sensitivityMmMv?: number;
  layoutType?: ECGLayoutType;
}): ECGRenderMetrics {
  const {
    canvas,
    visibleChannels,
    windowMs,
    valueRange,
    sweepSpeed,
    sensitivityMmMv,
    layoutType = '12x1',
  } = args;
  const resolvedSweepSpeed = sweepSpeed ?? ECG_DEFAULT_SWEEP_SPEED_MM_S;
  // Pixels per second at 1:1 (sweep speed in mm/s × px/mm)
  const pxPerSecond = resolvedSweepSpeed * ECG_PX_PER_MM;
  const ecgWidth = Math.max(1, Math.ceil((windowMs / 1000) * pxPerSecond));

  const [minValue, maxValue] = valueRange;
  const range = Math.max(1, maxValue - minValue);
  let channelScale: number;

  if (sensitivityMmMv != null && sensitivityMmMv > 0) {
    // Clinically calibrated scale. The three factors carry these units:
    //   sensitivityMmMv  mm for each millivolt
    //   ECG_PX_PER_MM    pixels for each mm
    //   mvPerUnit        millivolts for each raw sample unit
    // The product is therefore pixels for each raw sample unit, which is what
    // the draw code and the layout need. The waveform data holds raw units, so
    // the third factor is not optional: without it the scale is too large by
    // the reciprocal of mvPerUnit, which is 1000 for a typical ECG.
    channelScale =
      sensitivityMmMv * ECG_PX_PER_MM * getECGMvPerUnit(visibleChannels);
  } else {
    // Legacy auto-fit: fill canvas height with amplitude range
    const canvasAspect =
      canvas.clientHeight && canvas.clientWidth
        ? canvas.clientHeight / canvas.clientWidth
        : 2 / 3;
    const targetTotalHeight = ecgWidth * canvasAspect;
    // Use the same row count that the layout uses, so the auto-fit scale still
    // fills the canvas when the waveform holds more leads than the nominal
    // layout holds.
    const rowCount = getECGLayoutRowCount(layoutType, visibleChannels.length);
    const totalSpacing = ECG_CHANNEL_SPACING * Math.max(1, rowCount);
    const heightPerChannel =
      (targetTotalHeight - totalSpacing) / Math.max(1, rowCount);
    channelScale = heightPerChannel / (range * 1.25);
  }

  const ecgHeight = computeECGHeight(visibleChannels, channelScale, layoutType);
  const clientWidth = canvas.clientWidth || canvas.width || ecgWidth;
  const clientHeight = canvas.clientHeight || canvas.height || ecgHeight;
  const worldToCanvasRatio = Math.min(
    clientWidth / Math.max(1, ecgWidth),
    clientHeight / Math.max(1, ecgHeight)
  );
  const drawWidth = ecgWidth * worldToCanvasRatio;
  const drawHeight = ecgHeight * worldToCanvasRatio;

  return {
    ecgWidth,
    ecgHeight,
    channelScale,
    worldToCanvasRatio,
    xOffsetCanvas: (clientWidth - drawWidth) / 2,
    yOffsetCanvas: (clientHeight - drawHeight) / 2,
    pxPerSecond,
    sweepSpeed: resolvedSweepSpeed,
  };
}

export function drawECGGrid<TChannel extends ECGChannelLike = ECGChannelLike>(
  ctx: CanvasRenderingContext2D,
  metrics: Partial<ECGRenderMetrics> & {
    ecgWidth: number;
    ecgHeight: number;
    channelScale: number;
    sweepSpeed?: number;
    sensitivityMmMv?: number;
    showAmplitudeLabels?: boolean;
    pxPerSecond?: number;
  },
  options?: { showGrid?: boolean },
  layouts?: ECGChannelLayout<TChannel>[]
): void {
  if (options?.showGrid === false || metrics.channelScale <= 0) {
    return;
  }

  const {
    ecgWidth,
    ecgHeight,
    channelScale,
    sweepSpeed,
    sensitivityMmMv,
    showAmplitudeLabels = true,
    worldToCanvasRatio = 1,
    pxPerSecond,
  } = metrics;

  let minorH: number;
  let majorH: number;

  if (sensitivityMmMv != null && sensitivityMmMv > 0) {
    // Calibrated amplitude: a minor block is 1 mm, and a major block is 5 mm.
    minorH = ECG_PX_PER_MM;
    majorH = ECG_PX_PER_MM * 5;
  } else {
    // Auto-fit amplitude: pick the largest grid unit that still draws.
    const minLineSpacing = 8;
    let horizontalGridUnit = 100;

    while (horizontalGridUnit * channelScale < minLineSpacing) {
      horizontalGridUnit *= 2;
    }

    minorH = horizontalGridUnit * channelScale;
    majorH = minorH * 5;
  }

  // The vertical lines mark paper millimetres on the time axis, and one
  // millimetre of paper is 1/sweepSpeed seconds. The world width already
  // encodes the sweep speed through `pxPerSecond`, so the same formula serves
  // the calibrated path and the auto-fit path. The previous code used
  // `ECG_SECONDS_WIDTH` here while the width came from the sweep speed, so a
  // major block covered 0.317 s in place of 0.2 s.
  const resolvedSweepSpeed =
    sweepSpeed != null && sweepSpeed > 0
      ? sweepSpeed
      : ECG_DEFAULT_SWEEP_SPEED_MM_S;
  const resolvedPxPerSecond =
    pxPerSecond != null && pxPerSecond > 0 ? pxPerSecond : ECG_SECONDS_WIDTH;
  const minorV = resolvedPxPerSecond / resolvedSweepSpeed;
  const majorV = minorV * 5;

  const effectiveMinorH = minorH * worldToCanvasRatio;
  const effectiveMinorV = minorV * worldToCanvasRatio;

  // Only draw minor grid lines if spaced at least 4px apart on screen to prevent lag
  if (effectiveMinorH >= 4 && effectiveMinorV >= 4) {
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
  }

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

  // Draw per-lead relative millivolt markers on major grid lines relative to channel baseline
  if (
    showAmplitudeLabels &&
    sensitivityMmMv != null &&
    sensitivityMmMv > 0 &&
    layouts
  ) {
    ctx.fillStyle = ECG_RENDERING_COLORS.label;
    const mvPerMajor = 5 / sensitivityMmMv;
    const fontSize = 10;
    ctx.font = `${fontSize}px monospace`;

    layouts.forEach((layout) => {
      const { baseline, itemHeight } = layout;
      const yPlus = baseline - majorH;
      const yMinus = baseline + majorH;

      if (yPlus >= baseline - itemHeight) {
        ctx.fillText(`+${mvPerMajor.toFixed(1)} mV`, 5, yPlus - 2);
      }
      if (yMinus <= baseline + itemHeight) {
        ctx.fillText(`-${mvPerMajor.toFixed(1)} mV`, 5, yMinus - 2);
      }
    });
  }
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

  layouts.forEach(
    ({
      channel,
      baseline,
      xOffset = 0,
      width: traceWidth = ecgWidth,
      startSample,
      endSample,
    }) => {
      // The layout always sets `endSample` now, so the clamp against the real
      // length of the channel has to be explicit. A channel array shorter than
      // `numberOfSamples` otherwise yields `undefined` samples, and
      // `ctx.lineTo(x, NaN)` blanks the whole trace.
      const layoutStart = startSample ?? 0;
      const layoutEnd = Math.min(
        endSample ?? channel.data.length,
        channel.data.length
      );
      // A cell whose time window falls past the end of a truncated channel
      // still gets its baseline, so the reader sees an empty cell in place of
      // nothing.
      const hasSamples = layoutEnd > layoutStart;

      const windowStart = startIndex !== undefined ? startIndex : layoutStart;
      const windowEnd = endIndex !== undefined ? endIndex : layoutEnd;

      const resolvedStartIndex = Math.max(
        layoutStart,
        Math.min(windowStart, layoutEnd - 1)
      );
      const resolvedEndIndex = Math.min(
        layoutEnd,
        Math.max(windowEnd, resolvedStartIndex + 1)
      );
      const sampleCount = Math.max(1, resolvedEndIndex - resolvedStartIndex);

      ctx.strokeStyle = ECG_RENDERING_COLORS.baseline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xOffset, baseline);
      ctx.lineTo(xOffset + traceWidth, baseline);
      ctx.stroke();

      if (!hasSamples) {
        return;
      }

      ctx.strokeStyle = ECG_RENDERING_COLORS.trace;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();

      for (let index = resolvedStartIndex; index < resolvedEndIndex; index++) {
        const x =
          xOffset + ((index - resolvedStartIndex) * traceWidth) / sampleCount;
        const y =
          baseline - channel.data[index] * channelScale * amplitudeScale;

        if (index === resolvedStartIndex) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }
  );
}

export function drawECGLabels<TChannel extends ECGChannelLike>(
  ctx: CanvasRenderingContext2D,
  layouts: ECGChannelLayout<TChannel>[],
  worldToCanvasRatio: number
): void {
  const fontSize = 14 / (worldToCanvasRatio || 1);

  layouts.forEach(({ channel, itemHeight, yOffset, xOffset = 0 }) => {
    const labelY = yOffset - itemHeight + fontSize;

    ctx.font = `${fontSize}px monospace`;
    const textWidth = ctx.measureText(channel.name).width;
    ctx.fillStyle = ECG_RENDERING_COLORS.background;
    ctx.fillRect(xOffset + 5, labelY - fontSize, textWidth + 4, fontSize + 4);
    ctx.fillStyle = ECG_RENDERING_COLORS.label;
    ctx.fillText(channel.name, xOffset + 5, labelY);
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
