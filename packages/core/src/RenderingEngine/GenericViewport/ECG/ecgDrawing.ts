import type { ECGChannelLayout, ECGRenderMetrics } from './ecgGeometry';
import type { ECGCanvasTransform } from './ECGResolvedView';
import {
  ECG_DEFAULT_SWEEP_SPEED_MM_S,
  ECG_PX_PER_MM,
  ECG_RENDERING_COLORS,
  ECG_SECONDS_WIDTH,
  type ECGChannelLike,
} from './ecgWaveform';

/**
 * Draws the ECG paper grid, and the millivolt labels when calibrated.
 * `options.bounds` is the area to cover, in layout units. It defaults to the
 * paper area; the render path gives the whole canvas, so that the grid fills
 * the canvas at one scale.
 */
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
  options?: {
    showGrid?: boolean;
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  },
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

  const {
    minX = 0,
    minY = 0,
    maxX = ecgWidth,
    maxY = ecgHeight,
  } = options?.bounds ?? {};
  const effectiveMinorH = minorH * worldToCanvasRatio;
  const effectiveMinorV = minorV * worldToCanvasRatio;

  // Only draw minor grid lines if spaced at least 4px apart on screen to prevent lag
  if (effectiveMinorH >= 4 && effectiveMinorV >= 4) {
    ctx.strokeStyle = ECG_RENDERING_COLORS.gridMinor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();

    forEachGridLine(minY, maxY, minorH, (y, k) => {
      if (k % 5 !== 0) {
        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
      }
    });
    forEachGridLine(minX, maxX, minorV, (x, k) => {
      if (k % 5 !== 0) {
        ctx.moveTo(x, minY);
        ctx.lineTo(x, maxY);
      }
    });

    ctx.stroke();
  }

  ctx.strokeStyle = ECG_RENDERING_COLORS.gridMajor;
  ctx.lineWidth = 1;
  ctx.beginPath();

  forEachGridLine(minY, maxY, majorH, (y) => {
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y);
  });
  forEachGridLine(minX, maxX, majorV, (x) => {
    ctx.moveTo(x, minY);
    ctx.lineTo(x, maxY);
  });

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
}): void {
  const { ctx, layouts, lineWidth = 1, amplitudeScale = 1 } = args;

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

      const step = width / sampleCount;

      for (let index = startSample; index < lastSample; index++) {
        const x = xOffset + (index - startSample) * step;
        const y =
          baseline - channel.data[index] * channelScale * amplitudeScale;

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

/**
 * Draws the label of each layout at its top left corner, under the world
 * transform of the deprecated ECG class. The text keeps 14 screen px.
 */
export function drawECGLabels<TChannel extends ECGChannelLike>(
  ctx: CanvasRenderingContext2D,
  layouts: ECGChannelLayout<TChannel>[],
  worldToCanvasRatio: number
): void {
  const fontSize = 14 / (worldToCanvasRatio || 1);

  layouts.forEach(({ label, itemHeight, yOffset, xOffset }) => {
    const labelY = yOffset - itemHeight + fontSize;

    ctx.font = `${fontSize}px monospace`;
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = ECG_RENDERING_COLORS.background;
    ctx.fillRect(xOffset + 5, labelY - fontSize, textWidth + 4, fontSize + 4);
    ctx.fillStyle = ECG_RENDERING_COLORS.label;
    ctx.fillText(label, xOffset + 5, labelY);
  });
}

/**
 * Draws the label of each layout at its top left corner, with no transform on
 * the context. `transform` is the canvas transform of the resolved view, so
 * the label is at its region at every zoom, and the text keeps 12 CSS px.
 */
export function drawECGCanvasLabels<TChannel extends ECGChannelLike>(
  ctx: CanvasRenderingContext2D,
  layouts: ECGChannelLayout<TChannel>[],
  transform: ECGCanvasTransform,
  dpr = 1
): void {
  const fontSize = 12 * dpr;
  const { effectiveRatio, xOffset, yOffset } = transform;

  ctx.font = `${fontSize}px monospace`;
  layouts.forEach((layout) => {
    const x = (layout.xOffset * effectiveRatio + xOffset + 5) * dpr;
    const y =
      ((layout.yOffset - layout.itemHeight) * effectiveRatio + yOffset + 2) *
        dpr +
      fontSize;
    const textWidth = ctx.measureText(layout.label).width;

    ctx.fillStyle = ECG_RENDERING_COLORS.background;
    ctx.fillRect(x, y - fontSize, textWidth + 4 * dpr, fontSize + 4 * dpr);
    ctx.fillStyle = ECG_RENDERING_COLORS.label;
    ctx.fillText(layout.label, x, y);
  });
}

/** Calls `draw` for each multiple `k * step` in `[min, max]`. */
function forEachGridLine(
  min: number,
  max: number,
  step: number,
  draw: (value: number, k: number) => void
): void {
  if (!(step > 0)) {
    return;
  }
  for (let k = Math.ceil(min / step); k * step <= max; k++) {
    draw(k * step, Math.abs(k));
  }
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
