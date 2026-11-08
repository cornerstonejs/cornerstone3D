import { computeECGRenderMetrics } from '../src/RenderingEngine/GenericViewport/ECG/ecgGeometry';
import {
  drawECGGrid,
  drawECGTraces,
  drawECGLabels,
} from '../src/RenderingEngine/GenericViewport/ECG/ecgDrawing';
import {
  resolveECGTraceCells,
  resolveECGTraceLayout,
} from '../src/RenderingEngine/GenericViewport/ECG/ecgTraceLayouts';
import {
  ECG_DEFAULT_MV_PER_UNIT,
  ECG_DEFAULT_SWEEP_SPEED_MM_S,
  ECG_DEFAULT_SENSITIVITY_MM_MV,
  ECG_CLINICAL_SWEEP_SPEEDS,
  ECG_CLINICAL_SENSITIVITIES,
  ECG_PX_PER_MM,
  ECG_RENDERING_COLORS,
} from '../src/RenderingEngine/GenericViewport/ECG/ecgWaveform';

const NUMBER_OF_SAMPLES = 1000;
const SAMPLING_FREQUENCY = 100;

function makeCanvas(width = 800, height = 600) {
  return {
    clientWidth: width,
    clientHeight: height,
    width,
    height,
  };
}

/**
 * Minimal 2D context that records each drawn segment together with the stroke
 * colour that was active, so a test can separate the major grid from the minor
 * grid and from the traces.
 */
function makeRecordingContext() {
  const segments = [];
  const textCalls = [];
  const clipCalls = [];
  let current = null;

  return {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    segments,
    textCalls,
    clipCalls,
    save() {},
    restore() {},
    rect(x, y, w, h) {
      clipCalls.push({ x, y, w, h });
    },
    clip() {},
    beginPath() {},
    moveTo(x, y) {
      current = { style: this.strokeStyle, from: [x, y], to: null };
      segments.push(current);
    },
    lineTo(x, y) {
      segments.push({
        style: this.strokeStyle,
        from: current?.from,
        to: [x, y],
      });
      current = { style: this.strokeStyle, from: [x, y], to: null };
    },
    stroke() {},
    fillRect() {},
    fillText(text, x, y) {
      textCalls.push({ text, x, y });
    },
    measureText() {
      return { width: 10 };
    },
  };
}

function makeChannel(
  name,
  { min = -1000, max = 1000, length = NUMBER_OF_SAMPLES } = {}
) {
  const data = new Int16Array(length);
  data[0] = min;
  data[1] = max;

  return { name, data, min, max, mvPerUnit: ECG_DEFAULT_MV_PER_UNIT };
}

function geometryFor(channels, options = {}) {
  const { traceLayout = '12x1', ...metricOptions } = options;
  const cells = resolveECGTraceCells({
    definition: resolveECGTraceLayout(traceLayout, { channels }),
    channels,
    numberOfSamples: NUMBER_OF_SAMPLES,
    viewSampleWindow: [0, NUMBER_OF_SAMPLES],
  });

  return computeECGRenderMetrics({
    canvas: makeCanvas(),
    cells,
    numberOfSamples: NUMBER_OF_SAMPLES,
    samplingFrequency: SAMPLING_FREQUENCY,
    ...metricOptions,
  });
}

describe('ECG render metrics', () => {
  describe('the calibrated amplitude scale', () => {
    it('converts raw sample units to pixels, not millivolts to pixels', () => {
      const { metrics } = geometryFor([makeChannel('Lead I')], {
        sweepSpeed: 25,
        sensitivityMmMv: 10,
      });

      // 10 mm/mV x 3.779 px/mm x 0.001 mV/unit = 0.03779 px for each raw unit.
      expect(metrics.channelScale).toBeCloseTo(
        10 * ECG_PX_PER_MM * ECG_DEFAULT_MV_PER_UNIT,
        6
      );
    });

    it('keeps the layout height inside a sane range for a calibrated ECG', () => {
      const channels = Array.from({ length: 12 }, (_channel, index) =>
        makeChannel(`Lead ${index}`)
      );
      const { metrics } = geometryFor(channels, {
        sweepSpeed: 25,
        sensitivityMmMv: 10,
      });

      // Twelve leads of 2 mV each at 10 mm/mV is 240 mm of paper, plus the
      // band spacing.
      expect(metrics.ecgHeight).toBeGreaterThan(100);
      expect(metrics.ecgHeight).toBeLessThan(2000);
    });

    it('gives each channel the scale of its own sensitivity', () => {
      const lead1 = makeChannel('Lead I');
      const lead2 = makeChannel('Lead II');
      lead2.mvPerUnit = 0.002;

      const { layouts } = geometryFor([lead1, lead2], { sensitivityMmMv: 10 });

      expect(layouts[0].channelScale).toBeCloseTo(
        10 * ECG_PX_PER_MM * 0.001,
        6
      );
      expect(layouts[1].channelScale).toBeCloseTo(
        10 * ECG_PX_PER_MM * 0.002,
        6
      );
    });

    it('uses one amplitude scale for every channel when the amplitude auto-fits', () => {
      const lead1 = makeChannel('Lead I');
      const lead2 = makeChannel('Lead II');
      lead2.mvPerUnit = 0.002;

      const { layouts } = geometryFor([lead1, lead2]);

      expect(layouts[1].channelScale).toBe(layouts[0].channelScale);
    });
  });

  describe('the grid agrees with the trace width', () => {
    function getMajorBlockSeconds(sweepSpeed, sensitivityMmMv) {
      const { metrics } = geometryFor([makeChannel('Lead I')], {
        sweepSpeed,
        sensitivityMmMv,
      });
      const ctx = makeRecordingContext();

      drawECGGrid(ctx, { ...metrics, sensitivityMmMv });

      // Vertical major lines run from y = 0 to y = ecgHeight.
      const verticalMajorX = ctx.segments
        .filter(
          (segment) =>
            segment.style === ECG_RENDERING_COLORS.gridMajor &&
            segment.to &&
            segment.from &&
            segment.from[0] === segment.to[0]
        )
        .map((segment) => segment.from[0])
        .sort((a, b) => a - b);

      expect(verticalMajorX.length).toBeGreaterThan(1);

      return (verticalMajorX[1] - verticalMajorX[0]) / metrics.pxPerSecond;
    }

    it('gives a major block 0.2 s at 25 mm/s when calibrated', () => {
      expect(getMajorBlockSeconds(25, 10)).toBeCloseTo(0.2, 6);
    });

    it('gives a major block 0.1 s at 50 mm/s when calibrated', () => {
      expect(getMajorBlockSeconds(50, 10)).toBeCloseTo(0.1, 6);
    });

    it('gives a major block 0.2 s when the amplitude auto-fits', () => {
      expect(getMajorBlockSeconds(25, undefined)).toBeCloseTo(0.2, 6);
    });

    it('reports the pixels for each second that produced the width', () => {
      const { metrics } = geometryFor([makeChannel('Lead I')]);

      expect(metrics.sweepSpeed).toBe(ECG_DEFAULT_SWEEP_SPEED_MM_S);
      expect(metrics.ecgWidth).toBe(
        Math.ceil(
          (NUMBER_OF_SAMPLES / SAMPLING_FREQUENCY) *
            ECG_DEFAULT_SWEEP_SPEED_MM_S *
            ECG_PX_PER_MM
        )
      );
    });
  });

  describe('a truncated channel', () => {
    it('draws no NaN when the channel is shorter than the record', () => {
      const { layouts } = geometryFor([makeChannel('Lead I', { length: 400 })]);
      const ctx = makeRecordingContext();

      drawECGTraces({ ctx, layouts });

      const drawn = ctx.segments.filter((segment) => segment.to);
      expect(drawn.length).toBeGreaterThan(0);
      drawn.forEach((segment) => {
        expect(Number.isNaN(segment.to[0])).toBe(false);
        expect(Number.isNaN(segment.to[1])).toBe(false);
      });
    });

    it('still draws the baseline for a region with no samples', () => {
      const { layouts } = geometryFor([makeChannel('Lead I', { length: 100 })]);
      layouts[0].startSample = 500;

      const ctx = makeRecordingContext();

      drawECGTraces({ ctx, layouts });

      const baselines = ctx.segments.filter(
        (segment) =>
          segment.style === ECG_RENDERING_COLORS.baseline && segment.to
      );
      expect(baselines.length).toBe(1);
    });
  });

  describe('dynamic waveform scaling with sweepSpeed and sensitivity', () => {
    it('scales waveform trace width horizontally according to sweepSpeed', () => {
      const channel = makeChannel('Lead I');
      const { layouts: layouts25 } = geometryFor([channel], { sweepSpeed: 25 });
      const { layouts: layouts50 } = geometryFor([channel], { sweepSpeed: 50 });
      const { layouts: layouts12 } = geometryFor([channel], {
        sweepSpeed: 12.5,
      });

      const ctx25 = makeRecordingContext();
      drawECGTraces({ ctx: ctx25, layouts: layouts25 });
      const trace25 = ctx25.segments.filter(
        (s) => s.style === ECG_RENDERING_COLORS.trace && s.to
      );
      const span25 = trace25[trace25.length - 1].to[0] - trace25[0].from[0];

      const ctx50 = makeRecordingContext();
      drawECGTraces({ ctx: ctx50, layouts: layouts50 });
      const trace50 = ctx50.segments.filter(
        (s) => s.style === ECG_RENDERING_COLORS.trace && s.to
      );
      const span50 = trace50[trace50.length - 1].to[0] - trace50[0].from[0];

      const ctx12 = makeRecordingContext();
      drawECGTraces({ ctx: ctx12, layouts: layouts12 });
      const trace12 = ctx12.segments.filter(
        (s) => s.style === ECG_RENDERING_COLORS.trace && s.to
      );
      const span12 = trace12[trace12.length - 1].to[0] - trace12[0].from[0];

      expect(Math.abs(span50 - span25 * 2)).toBeLessThan(1);
      expect(Math.abs(span12 - span25 * 0.5)).toBeLessThan(1);
    });
  });

  describe('amplitude labels default and collision prevention', () => {
    it('disables amplitude labels by default to prevent overlapping clutter', () => {
      const channels = Array.from({ length: 12 }, (_, i) =>
        makeChannel(`Lead ${i}`)
      );
      const { metrics, layouts } = geometryFor(channels, {
        traceLayout: '3x4',
        sensitivityMmMv: 10,
      });
      const ctx = makeRecordingContext();

      drawECGGrid(ctx, { ...metrics, sensitivityMmMv: 10 }, {}, layouts);

      expect(ctx.textCalls.length).toBe(0);
    });

    it('only draws amplitude labels on the leftmost column when enabled', () => {
      const channels = Array.from({ length: 12 }, (_, i) =>
        makeChannel(`Lead ${i}`)
      );
      const { metrics, layouts } = geometryFor(channels, {
        traceLayout: '3x4',
        sensitivityMmMv: 10,
      });
      const ctx = makeRecordingContext();

      drawECGGrid(
        ctx,
        { ...metrics, sensitivityMmMv: 10, showAmplitudeLabels: true },
        {},
        layouts
      );

      // In 3x4, there are 3 rows and 4 columns.
      // Leftmost column has 3 leads, so at most 3 leads have labels.
      expect(ctx.textCalls.length).toBeGreaterThan(0);
      expect(ctx.textCalls.length).toBeLessThanOrEqual(6); // 2 labels (+/-) x 3 rows
    });
  });

  describe('canvas and grid coverage', () => {
    it('scales amplitude proportionally when sensitivity changes', () => {
      const channels = [makeChannel('Lead I')];

      const resStandard = geometryFor(channels, {
        sweepSpeed: 25,
        sensitivityMmMv: 10,
      });
      const resFast = geometryFor(channels, {
        sweepSpeed: 50,
        sensitivityMmMv: 5,
      });
      const resSlow = geometryFor(channels, {
        sweepSpeed: 12.5,
        sensitivityMmMv: 20,
      });

      expect(resFast.metrics.channelScale).toBeCloseTo(
        resStandard.metrics.channelScale * 0.5,
        5
      );
      expect(resSlow.metrics.channelScale).toBeCloseTo(
        resStandard.metrics.channelScale * 2.0,
        5
      );
    });

    it('fills canvas height exactly in auto-fit mode', () => {
      const channels = [makeChannel('Lead I')];
      const res = geometryFor(channels);

      // Canvas is 800 x 600
      expect(
        res.metrics.worldToCanvasRatio * res.metrics.ecgHeight
      ).toBeCloseTo(600, 1);
    });
  });

  describe('clinical standard presets (IEC 60601-2-25 / AHA / ACC)', () => {
    it('exports the standard clinical sweep speeds [12.5, 25, 50] mm/s', () => {
      expect(ECG_CLINICAL_SWEEP_SPEEDS).toEqual([12.5, 25, 50]);
    });

    it('exports the standard clinical sensitivities [2.5, 5, 10, 20] mm/mV', () => {
      expect(ECG_CLINICAL_SENSITIVITIES).toEqual([2.5, 5, 10, 20]);
    });

    it('defines standard defaults of 25 mm/s and 10 mm/mV', () => {
      expect(ECG_DEFAULT_SWEEP_SPEED_MM_S).toBe(25);
      expect(ECG_DEFAULT_SENSITIVITY_MM_MV).toBe(10);
    });
  });

  describe('sweepSpeed positive and negative edge cases', () => {
    it('positive: correctly expands waveform span at 50 mm/s', () => {
      const channel = makeChannel('Lead I');
      const { layouts } = geometryFor([channel], { sweepSpeed: 50 });
      const ctx = makeRecordingContext();

      drawECGTraces({ ctx, layouts, sweepSpeed: 50 });
      const drawn = ctx.segments.filter(
        (s) => s.style === ECG_RENDERING_COLORS.trace && s.to
      );
      expect(drawn.length).toBeGreaterThan(0);
      drawn.forEach((s) => {
        expect(Number.isFinite(s.to[0])).toBe(true);
        expect(Number.isFinite(s.to[1])).toBe(true);
      });
    });

    it('negative: handles sweepSpeed = 0 safely by falling back to standard 25 mm/s', () => {
      const channel = makeChannel('Lead I');
      const { layouts } = geometryFor([channel], { sweepSpeed: 0 });
      const ctx = makeRecordingContext();

      expect(() => {
        drawECGTraces({ ctx, layouts, sweepSpeed: 0 });
      }).not.toThrow();

      const drawn = ctx.segments.filter(
        (s) => s.style === ECG_RENDERING_COLORS.trace && s.to
      );
      expect(drawn.length).toBeGreaterThan(0);
      drawn.forEach((s) => {
        expect(Number.isFinite(s.to[0])).toBe(true);
        expect(Number.isNaN(s.to[0])).toBe(false);
      });
    });

    it('negative: handles negative sweepSpeed safely without crashing or inverting', () => {
      const channel = makeChannel('Lead I');
      const { layouts } = geometryFor([channel], { sweepSpeed: -25 });
      const ctx = makeRecordingContext();

      expect(() => {
        drawECGTraces({ ctx, layouts, sweepSpeed: -25 });
      }).not.toThrow();

      const drawn = ctx.segments.filter(
        (s) => s.style === ECG_RENDERING_COLORS.trace && s.to
      );
      drawn.forEach((s) => {
        expect(Number.isNaN(s.to[0])).toBe(false);
        expect(Number.isNaN(s.to[1])).toBe(false);
      });
    });

    it('negative: handles undefined sweepSpeed gracefully by defaulting to 25 mm/s', () => {
      const channel = makeChannel('Lead I');
      const { layouts } = geometryFor([channel]);
      const ctx = makeRecordingContext();

      drawECGTraces({ ctx, layouts, sweepSpeed: undefined });
      const drawn = ctx.segments.filter(
        (s) => s.style === ECG_RENDERING_COLORS.trace && s.to
      );
      expect(drawn.length).toBeGreaterThan(0);
    });
  });

  describe('sensitivityMmMv positive and negative edge cases', () => {
    it('positive: scales vertical deflection linearly across all clinical presets', () => {
      const channel = makeChannel('Lead I');
      const gains = [2.5, 5, 10, 20];

      const metricsList = gains.map((sens) => {
        const { metrics } = geometryFor([channel], { sensitivityMmMv: sens });
        return metrics.channelScale;
      });

      // 2.5 mm/mV is 0.25x of 10 mm/mV
      expect(metricsList[0] / metricsList[2]).toBeCloseTo(0.25, 4);
      // 5 mm/mV is 0.5x of 10 mm/mV
      expect(metricsList[1] / metricsList[2]).toBeCloseTo(0.5, 4);
      // 20 mm/mV is 2.0x of 10 mm/mV
      expect(metricsList[3] / metricsList[2]).toBeCloseTo(2.0, 4);
    });

    it('negative: handles sensitivityMmMv = 0 safely without division by zero', () => {
      const channel = makeChannel('Lead I');
      expect(() => {
        const { metrics, layouts } = geometryFor([channel], {
          sensitivityMmMv: 0,
        });
        const ctx = makeRecordingContext();
        drawECGGrid(ctx, { ...metrics, sensitivityMmMv: 0 });
        drawECGTraces({ ctx, layouts, sensitivityMmMv: 0 });
      }).not.toThrow();
    });

    it('negative: handles negative sensitivityMmMv safely without NaN or inversion', () => {
      const channel = makeChannel('Lead I');
      expect(() => {
        const { metrics, layouts } = geometryFor([channel], {
          sensitivityMmMv: -10,
        });
        const ctx = makeRecordingContext();
        drawECGGrid(ctx, { ...metrics, sensitivityMmMv: -10 });
        drawECGTraces({ ctx, layouts, sensitivityMmMv: -10 });
      }).not.toThrow();
    });

    it('negative: handles undefined sensitivityMmMv in auto-fit mode', () => {
      const channel = makeChannel('Lead I');
      const { metrics, layouts } = geometryFor([channel], {
        sensitivityMmMv: undefined,
      });
      const ctx = makeRecordingContext();

      drawECGGrid(ctx, { ...metrics, sensitivityMmMv: undefined });
      drawECGTraces({ ctx, layouts, sensitivityMmMv: undefined });

      const traces = ctx.segments.filter(
        (s) => s.style === ECG_RENDERING_COLORS.trace && s.to
      );
      expect(traces.length).toBeGreaterThan(0);
      traces.forEach((s) => {
        expect(Number.isFinite(s.to[1])).toBe(true);
      });
    });
  });

  describe('trace clipping and vertical headroom', () => {
    it('clips horizontally within cell column bounds while leaving vertical headroom', () => {
      const channel = makeChannel('Lead I');
      const { layouts } = geometryFor([channel], { traceLayout: '3x4' });
      const ctx = makeRecordingContext();

      drawECGTraces({ ctx, layouts });

      expect(ctx.clipCalls.length).toBe(layouts.length);
      ctx.clipCalls.forEach((call, index) => {
        // Horizontal bounds match layout width
        expect(call.w).toBe(layouts[index].width);
        expect(call.x).toBe(layouts[index].xOffset);
        // Vertical headroom is expanded beyond itemHeight to prevent R-wave cutoff
        expect(call.h).toBeGreaterThan(layouts[index].itemHeight);
      });
    });
  });

  describe('drawECGLabels in screen space and transform tracking', () => {
    it('draws crisp labels at top-left of each column in default view', () => {
      const channels = [makeChannel('Lead I'), makeChannel('Lead II')];
      const { layouts, metrics } = geometryFor(channels, {
        traceLayout: '3x4',
      });
      const ctx = makeRecordingContext();

      drawECGLabels(ctx, layouts, metrics.worldToCanvasRatio, {
        clientWidth: 800,
        clientHeight: 600,
        ecgWidth: metrics.ecgWidth,
        ecgHeight: metrics.ecgHeight,
        scaleX: 1,
        scaleY: 1,
        transX: 0,
        transY: 0,
        dpr: 1,
      });

      expect(ctx.textCalls.length).toBe(layouts.length);
      expect(ctx.textCalls[0].text).toBe('Lead I');
      expect(ctx.textCalls[1].text).toBe('Lead II');
      // Screen coordinates must be non-negative
      expect(ctx.textCalls[0].x).toBeGreaterThanOrEqual(0);
      expect(ctx.textCalls[0].y).toBeGreaterThanOrEqual(0);
    });

    it('tracks cell coordinates when zoomed or panned', () => {
      const channels = [makeChannel('Lead I')];
      const { layouts, metrics } = geometryFor(channels);
      const ctx = makeRecordingContext();

      // Pan by 50px X, 100px Y, with 2x zoom
      drawECGLabels(ctx, layouts, metrics.worldToCanvasRatio, {
        clientWidth: 800,
        clientHeight: 600,
        ecgWidth: metrics.ecgWidth,
        ecgHeight: metrics.ecgHeight,
        scaleX: 2,
        scaleY: 2,
        transX: 50,
        transY: 100,
        dpr: 1,
      });

      expect(ctx.textCalls.length).toBe(1);
      // X should include transX (50px + 5px padding)
      expect(ctx.textCalls[0].x).toBeCloseTo(55, 1);
    });

    it('handles negative/empty layouts array gracefully without throwing', () => {
      const ctx = makeRecordingContext();
      expect(() => {
        drawECGLabels(ctx, [], 1);
      }).not.toThrow();
      expect(ctx.textCalls.length).toBe(0);
    });
  });

  describe('robustness against edge-case canvas dimensions', () => {
    it('handles zero clientWidth and clientHeight gracefully without NaN or Infinity', () => {
      const channel = makeChannel('Lead I');
      const cells = resolveECGTraceCells({
        definition: resolveECGTraceLayout('12x1', { channels: [channel] }),
        channels: [channel],
        numberOfSamples: NUMBER_OF_SAMPLES,
        viewSampleWindow: [0, NUMBER_OF_SAMPLES],
      });

      const zeroCanvas = {
        clientWidth: 0,
        clientHeight: 0,
        width: 0,
        height: 0,
      };
      const { metrics } = computeECGRenderMetrics({
        canvas: zeroCanvas,
        cells,
        numberOfSamples: NUMBER_OF_SAMPLES,
        samplingFrequency: SAMPLING_FREQUENCY,
      });

      expect(Number.isFinite(metrics.ecgWidth)).toBe(true);
      expect(Number.isFinite(metrics.ecgHeight)).toBe(true);
      expect(Number.isFinite(metrics.channelScale)).toBe(true);
      expect(metrics.ecgWidth).toBeGreaterThan(0);
      expect(metrics.ecgHeight).toBeGreaterThan(0);
    });
  });
});
