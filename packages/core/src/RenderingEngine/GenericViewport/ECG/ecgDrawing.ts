import type { ECGChannelLayout, ECGRenderMetrics } from './ecgGeometry';
import {
  ECG_DEFAULT_SWEEP_SPEED_MM_S,
  ECG_PX_PER_MM,
  ECG_RENDERING_COLORS,
  ECG_SECONDS_WIDTH,
  type ECGChannelLike,
} from './ecgWaveform';

/** Draws the ECG paper grid, and the millivolt labels when calibrated. */ export function drawECGGrid<
  TChannel extends ECGChannelLike = ECGChannelLike,
>(
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
  layouts?: Pick<ECGChannelLayout<TChannel>, 'baseline' | 'itemHeight'>[]
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

  // One paper millimetre is 1/sweepSpeed seconds, for both amplitude modes.
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

/**
 * Draws the trace of each layout. A layout draws its sample range across its
 * width, which is the range that the transforms of the resolved view use.
 */
export function drawECGTraces<TChannel extends ECGChannelLike>(args: {
  ctx: CanvasRenderingContext2D;
  layouts: ECGChannelLayout<TChannel>[];
  lineWidth?: number;
  amplitudeScale?: number;
}): void {
  const { ctx, layouts, lineWidth = 1, amplitudeScale = 1 } = args;

  layouts.forEach(
    ({
      channel,
      baseline,
      channelScale,
      xOffset,
      width,
      startSample,
      endSample,
    }) => {
      const sampleCount = Math.max(1, endSample - startSample);
      // A channel shorter than the record draws the samples that it holds.
      const lastSample = Math.min(endSample, channel.data.length);

      ctx.strokeStyle = ECG_RENDERING_COLORS.baseline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xOffset, baseline);
      ctx.lineTo(xOffset + width, baseline);
      ctx.stroke();

      if (lastSample <= startSample) {
        return;
      }

      ctx.strokeStyle = ECG_RENDERING_COLORS.trace;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();

      for (let index = startSample; index < lastSample; index++) {
        const x = xOffset + ((index - startSample) * width) / sampleCount;
        const y =
          baseline - channel.data[index] * channelScale * amplitudeScale;

        if (index === startSample) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }
  );
}

/** Draws the label of each layout at its top left corner. */
export function drawECGLabels<TChannel extends ECGChannelLike>(
  ctx: CanvasRenderingContext2D,
  layouts: ECGChannelLayout<TChannel>[],
  worldToCanvasRatio: number
): void {
  const fontSize = 14 / (worldToCanvasRatio || 1);

  layouts.forEach(({ label, itemHeight, yOffset, xOffset }) => {
    const labelY = yOffset - itemHeight + fontSize;

    ctx.font = `px monospace`;
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = ECG_RENDERING_COLORS.background;
    ctx.fillRect(xOffset + 5, labelY - fontSize, textWidth + 4, fontSize + 4);
    ctx.fillStyle = ECG_RENDERING_COLORS.label;
    ctx.fillText(label, xOffset + 5, labelY);
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
