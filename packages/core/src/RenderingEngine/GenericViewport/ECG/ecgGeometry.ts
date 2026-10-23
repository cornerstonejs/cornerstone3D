import type { ECGTraceCell } from './ecgTraceLayouts';
import {
  ECG_CHANNEL_SPACING,
  ECG_DEFAULT_SWEEP_SPEED_MM_S,
  ECG_PX_PER_MM,
  getECGChannelMvPerUnit,
  type ECGChannelLike,
} from './ecgWaveform';

/** Headroom above the amplitude range of a trace. */
const AMPLITUDE_HEADROOM = 1.25;

/** World position of one visible region of a trace layout. */
export interface ECGChannelLayout<
  TChannel extends ECGChannelLike = ECGChannelLike,
> {
  channel: TChannel;
  label: string;
  /** Height of the trace area. The area ends at `yOffset`. */
  itemHeight: number;
  /** World Y of the bottom of the band. */
  yOffset: number;
  /** World Y of amplitude 0. */
  baseline: number;
  /** World units for each raw amplitude unit of this channel. */
  channelScale: number;
  xOffset: number;
  width: number;
  /** Sample range `[startSample, endSample)` across the width. */
  startSample: number;
  endSample: number;
  /** The Z of a world point in this region. See `ECGTraceCell.leadIndex`. */
  leadIndex: number;
  regionIndex: number;
}

export interface ECGRenderMetrics {
  ecgWidth: number;
  ecgHeight: number;
  /** World units for each raw amplitude unit of the first visible channel. */
  channelScale: number;
  worldToCanvasRatio: number;
  xOffsetCanvas: number;
  yOffsetCanvas: number;
  /**
   * World pixels that one second of signal occupies. `drawECGGrid` needs this
   * value to place the vertical grid lines.
   */
  pxPerSecond: number;
  /** Sweep speed in mm/s that produced `pxPerSecond`. */
  sweepSpeed: number;
}

/**
 * Returns the world width that keeps one paper speed in every visible region:
 * a region shows its sample range across its share of the width.
 */
export function getECGWorldWidth(args: {
  cells: ECGTraceCell[];
  numberOfSamples: number;
  samplingFrequency: number;
  pxPerSecond: number;
}): number {
  const { cells, numberOfSamples, samplingFrequency, pxPerSecond } = args;
  let recordPerWidth = 0;

  cells.forEach(({ visible, region, startSample, endSample }) => {
    const widthFraction = region.bounds.maxX - region.bounds.minX;

    if (visible && widthFraction > 0) {
      recordPerWidth = Math.max(
        recordPerWidth,
        (endSample - startSample) / numberOfSamples / widthFraction
      );
    }
  });

  const durationSeconds = numberOfSamples / samplingFrequency;

  return Math.max(
    1,
    Math.ceil(durationSeconds * (recordPerWidth || 1) * pxPerSecond)
  );
}

interface ECGBand {
  minY: number;
  maxY: number;
  cells: ECGTraceCell[];
}

/**
 * Places the visible cells of a trace layout in world space.
 *
 * The regions that share a vertical extent form a band. A band shares the
 * height by the fraction of its extent among the visible bands, so a band
 * with no visible lead gets zero height, and a hidden lead never moves
 * another lead. X follows the region bounds across `ecgWidth`.
 *
 * With `sensitivityMmMv`, the amplitude scale is calibrated, and the height
 * grows to fit every band. Without it, one amplitude scale fills
 * `targetHeight`.
 */
export function computeECGTraceGeometry<TChannel extends ECGChannelLike>(args: {
  cells: ECGTraceCell<TChannel>[];
  ecgWidth: number;
  targetHeight: number;
  sensitivityMmMv?: number;
}): {
  channelScale: number;
  ecgHeight: number;
  layouts: ECGChannelLayout<TChannel>[];
} {
  const { cells, ecgWidth, targetHeight, sensitivityMmMv } = args;
  const bands = getVisibleBands(cells);

  if (!bands.length) {
    return { channelScale: 1, ecgHeight: 1, layouts: [] };
  }

  const isCalibrated = sensitivityMmMv != null && sensitivityMmMv > 0;
  const totalExtent = bands.reduce(
    (total, band) => total + (band.maxY - band.minY),
    0
  );
  const fractions = bands.map((band) =>
    totalExtent > 0 ? (band.maxY - band.minY) / totalExtent : 1 / bands.length
  );
  const range = (cell: ECGTraceCell) =>
    Math.max(1, cell.channel.max - cell.channel.min);

  let autoFitScale = 0;
  let ecgHeight: number;

  if (isCalibrated) {
    ecgHeight = Math.max(
      ...bands.map(
        (band, index) =>
          (Math.max(
            ...band.cells.map(
              (cell) => range(cell) * scaleOf(cell) * AMPLITUDE_HEADROOM
            )
          ) +
            ECG_CHANNEL_SPACING) /
          fractions[index]
      )
    );
  } else {
    autoFitScale = Math.max(
      Number.EPSILON,
      Math.min(
        ...bands.map(
          (band, index) =>
            (targetHeight * fractions[index] - ECG_CHANNEL_SPACING) /
            (Math.max(...band.cells.map(range)) * AMPLITUDE_HEADROOM)
        )
      )
    );
    ecgHeight = targetHeight;
  }

  function scaleOf(cell: ECGTraceCell): number {
    return isCalibrated
      ? sensitivityMmMv * ECG_PX_PER_MM * getECGChannelMvPerUnit(cell.channel)
      : autoFitScale;
  }

  const layouts: ECGChannelLayout<TChannel>[] = [];
  let top = 0;

  bands.forEach((band, index) => {
    const bandHeight = fractions[index] * ecgHeight;
    const yOffset = top + bandHeight;
    const itemHeight = bandHeight - ECG_CHANNEL_SPACING;
    const traceHeight = Math.max(
      ...band.cells.map(
        (cell) => range(cell) * scaleOf(cell) * AMPLITUDE_HEADROOM
      )
    );
    const lowest = Math.min(
      0,
      ...band.cells.map((cell) => cell.channel.min * scaleOf(cell))
    );
    // Centre the traces in the band, and keep one baseline for the band.
    const baseline =
      yOffset - Math.max(0, itemHeight - traceHeight) / 2 + lowest;

    band.cells.forEach((cell) => {
      const { bounds } = cell.region;

      layouts.push({
        channel: cell.channel as TChannel,
        label: cell.label,
        itemHeight,
        yOffset,
        baseline,
        channelScale: scaleOf(cell),
        xOffset: bounds.minX * ecgWidth,
        width: (bounds.maxX - bounds.minX) * ecgWidth,
        startSample: cell.startSample,
        endSample: cell.endSample,
        leadIndex: cell.leadIndex,
        regionIndex: cell.regionIndex,
      });
    });

    top = yOffset;
  });

  const firstVisible = bands[0].cells[0];

  return {
    channelScale: scaleOf(firstVisible),
    ecgHeight,
    layouts,
  };
}

/** Groups the visible cells by vertical extent, from the top down. */
function getVisibleBands(cells: ECGTraceCell[]): ECGBand[] {
  const bands = new Map<string, ECGBand>();

  cells.forEach((cell) => {
    if (!cell.visible) {
      return;
    }

    const { minY, maxY } = cell.region.bounds;
    const key = `${minY.toFixed(6)}:${maxY.toFixed(6)}`;
    const band = bands.get(key) ?? { minY, maxY, cells: [] };

    band.cells.push(cell);
    bands.set(key, band);
  });

  return Array.from(bands.values()).sort((a, b) => a.minY - b.minY);
}

/**
 * Computes the world geometry of one ECG frame: the world size, the amplitude
 * scale, the canvas fit, and the position of each visible region.
 */
export function computeECGRenderMetrics<TChannel extends ECGChannelLike>(args: {
  canvas: HTMLCanvasElement;
  cells: ECGTraceCell<TChannel>[];
  numberOfSamples: number;
  samplingFrequency: number;
  /** Sweep speed in mm/s. Defaults to `ECG_DEFAULT_SWEEP_SPEED_MM_S`. */
  sweepSpeed?: number;
  /** Amplitude sensitivity in mm/mV. Undefined fits the canvas height. */
  sensitivityMmMv?: number;
}): { metrics: ECGRenderMetrics; layouts: ECGChannelLayout<TChannel>[] } {
  const {
    canvas,
    cells,
    numberOfSamples,
    samplingFrequency,
    sweepSpeed,
    sensitivityMmMv,
  } = args;
  const resolvedSweepSpeed = sweepSpeed ?? ECG_DEFAULT_SWEEP_SPEED_MM_S;
  const pxPerSecond = resolvedSweepSpeed * ECG_PX_PER_MM;
  const ecgWidth = getECGWorldWidth({
    cells,
    numberOfSamples,
    samplingFrequency,
    pxPerSecond,
  });
  const canvasAspect =
    canvas.clientHeight && canvas.clientWidth
      ? canvas.clientHeight / canvas.clientWidth
      : 2 / 3;
  const { channelScale, ecgHeight, layouts } = computeECGTraceGeometry({
    cells,
    ecgWidth,
    targetHeight: ecgWidth * canvasAspect,
    sensitivityMmMv,
  });
  const clientWidth = canvas.clientWidth || canvas.width || ecgWidth;
  const clientHeight = canvas.clientHeight || canvas.height || ecgHeight;
  const worldToCanvasRatio = Math.min(
    clientWidth / Math.max(1, ecgWidth),
    clientHeight / Math.max(1, ecgHeight)
  );

  return {
    metrics: {
      ecgWidth,
      ecgHeight,
      channelScale,
      worldToCanvasRatio,
      xOffsetCanvas: (clientWidth - ecgWidth * worldToCanvasRatio) / 2,
      yOffsetCanvas: (clientHeight - ecgHeight * worldToCanvasRatio) / 2,
      pxPerSecond,
      sweepSpeed: resolvedSweepSpeed,
    },
    layouts,
  };
}
