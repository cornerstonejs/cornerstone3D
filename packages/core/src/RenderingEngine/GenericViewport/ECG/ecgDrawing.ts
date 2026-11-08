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
  layouts?: Pick<
    ECGChannelLayout<TChannel>,
    'baseline' | 'itemHeight' | 'xOffset'
  >[]
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
    showAmplitudeLabels = false,
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

    const firstColumnLayouts = layouts.filter(
      (layout) => !layout.xOffset || layout.xOffset === 0
    );

    if (majorH >= fontSize + 4) {
      firstColumnLayouts.forEach((layout) => {
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
  sweepSpeed?: number;
  sensitivityMmMv?: number;
}): void {
  const {
    ctx,
    layouts,
    lineWidth = 1,
    amplitudeScale = 1,
    sweepSpeed,
    sensitivityMmMv,
  } = args;

  const speedScale = sweepSpeed && sweepSpeed > 0 ? sweepSpeed / 25 : 1;
  const sensScale =
    sensitivityMmMv && sensitivityMmMv > 0 ? sensitivityMmMv / 10 : 1;

  layouts.forEach(
    ({
      channel,
      baseline,
      channelScale,
      xOffset,
      width,
      itemHeight,
      yOffset,
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

      ctx.save?.();
      ctx.beginPath?.();
      // Clip horizontally to column width to prevent trace spillover into adjacent leads,
      // while providing vertical headroom so tall R-peaks and deep S-waves are not chopped off
      ctx.rect?.(xOffset, yOffset - itemHeight * 2, width, itemHeight * 3);
      ctx.clip?.();

      ctx.strokeStyle = ECG_RENDERING_COLORS.trace;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();

      const step = (width / sampleCount) * speedScale;

      for (let index = startSample; index < lastSample; index++) {
        const x = xOffset + (index - startSample) * step;
        const y =
          baseline -
          channel.data[index] * channelScale * amplitudeScale * sensScale;

        if (index === startSample) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.restore?.();
    }
  );
}

/** Draws the label of each layout at its top left corner. */
export function drawECGLabels<TChannel extends ECGChannelLike>(
  ctx: CanvasRenderingContext2D,
  layouts: ECGChannelLayout<TChannel>[],
  worldToCanvasRatio: number,
  canvasOptions?: {
    clientWidth?: number;
    clientHeight?: number;
    ecgWidth?: number;
    ecgHeight?: number;
    scaleX?: number;
    scaleY?: number;
    transX?: number;
    transY?: number;
    dpr?: number;
  }
): void {
  const dpr = canvasOptions?.dpr || 1;
  const fontSize = 12 * dpr;
  ctx.font = `${fontSize}px monospace`;

  const clientW = canvasOptions?.clientWidth;
  const clientH = canvasOptions?.clientHeight;
  const ecgW = canvasOptions?.ecgWidth || 1;
  const ecgH = canvasOptions?.ecgHeight || 1;

  const scaleX = canvasOptions?.scaleX ?? (clientW ? clientW / ecgW : 1) * dpr;
  const scaleY = canvasOptions?.scaleY ?? (clientH ? clientH / ecgH : 1) * dpr;
  const transX = canvasOptions?.transX ?? 0;
  const transY = canvasOptions?.transY ?? 0;

  layouts.forEach(({ label, itemHeight, yOffset, xOffset }) => {
    let screenX: number;
    let screenY: number;

    if (canvasOptions?.scaleX !== undefined || (clientW && clientH)) {
      screenX = xOffset * scaleX + transX + 5 * dpr;
      screenY = (yOffset - itemHeight) * scaleY + transY + fontSize + 2 * dpr;
    } else {
      screenX = xOffset + 5;
      screenY = yOffset - itemHeight + fontSize;
    }

    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = ECG_RENDERING_COLORS.background;
    ctx.fillRect(
      screenX,
      screenY - fontSize,
      textWidth + 4 * dpr,
      fontSize + 4 * dpr
    );
    ctx.fillStyle = ECG_RENDERING_COLORS.label;
    ctx.fillText(label, screenX, screenY);
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
