import { computeECGRenderMetrics } from '../src/RenderingEngine/GenericViewport/ECG/ecgGeometry';
import {
  drawECGGrid,
  drawECGTraces,
} from '../src/RenderingEngine/GenericViewport/ECG/ecgDrawing';
import {
  resolveECGTraceCells,
  resolveECGTraceLayout,
} from '../src/RenderingEngine/GenericViewport/ECG/ecgTraceLayouts';
import {
  ECG_DEFAULT_MV_PER_UNIT,
  ECG_DEFAULT_SWEEP_SPEED_MM_S,
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
  let current = null;

  return {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    segments,
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
    fillText() {},
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
});
