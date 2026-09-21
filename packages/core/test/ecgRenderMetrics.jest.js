import {
  computeECGRenderMetrics,
  drawECGGrid,
  drawECGTraces,
  computeECGChannelLayouts,
  getECGMvPerUnit,
  ECG_DEFAULT_MV_PER_UNIT,
  ECG_DEFAULT_SWEEP_SPEED_MM_S,
  ECG_PX_PER_MM,
  ECG_RENDERING_COLORS,
} from '../src/utilities/ECGUtilities';

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

function makeChannel(name, { min = -1000, max = 1000, length = 1000 } = {}) {
  const data = new Int16Array(length);
  data[0] = min;
  data[1] = max;

  return { name, data, min, max, mvPerUnit: ECG_DEFAULT_MV_PER_UNIT };
}

describe('ECG render metrics', () => {
  describe('the calibrated amplitude scale', () => {
    it('converts raw sample units to pixels, not millivolts to pixels', () => {
      const channels = [makeChannel('Lead I')];
      const metrics = computeECGRenderMetrics({
        canvas: makeCanvas(),
        visibleChannels: channels,
        windowMs: 10000,
        valueRange: [-1000, 1000],
        sweepSpeed: 25,
        sensitivityMmMv: 10,
      });

      // 10 mm/mV x 3.779 px/mm x 0.001 mV/unit = 0.03779 px for each raw unit.
      expect(metrics.channelScale).toBeCloseTo(
        10 * ECG_PX_PER_MM * ECG_DEFAULT_MV_PER_UNIT,
        6
      );

      // One millivolt is 1000 raw units, and 10 mm/mV makes it 10 mm tall.
      const pixelsPerMv = metrics.channelScale / ECG_DEFAULT_MV_PER_UNIT;
      expect(pixelsPerMv).toBeCloseTo(10 * ECG_PX_PER_MM, 6);
    });

    it('keeps the layout height inside a sane range for a calibrated ECG', () => {
      const channels = Array.from({ length: 12 }, (_channel, index) =>
        makeChannel(`Lead ${index}`)
      );
      const metrics = computeECGRenderMetrics({
        canvas: makeCanvas(),
        visibleChannels: channels,
        windowMs: 10000,
        valueRange: [-1000, 1000],
        sweepSpeed: 25,
        sensitivityMmMv: 10,
      });

      // Twelve leads of 2 mV each at 10 mm/mV is 240 mm of paper, plus the row
      // spacing. The defect made this value about 2.3 million pixels.
      expect(metrics.ecgHeight).toBeGreaterThan(100);
      expect(metrics.ecgHeight).toBeLessThan(2000);
    });

    it('honours a channel sensitivity that differs from the default', () => {
      const channels = [makeChannel('Lead I')];
      channels[0].mvPerUnit = 0.005;

      const metrics = computeECGRenderMetrics({
        canvas: makeCanvas(),
        visibleChannels: channels,
        windowMs: 10000,
        valueRange: [-1000, 1000],
        sweepSpeed: 25,
        sensitivityMmMv: 10,
      });

      expect(metrics.channelScale).toBeCloseTo(10 * ECG_PX_PER_MM * 0.005, 6);
    });

    it('falls back to the default millivolts for each unit', () => {
      expect(getECGMvPerUnit([{ name: 'a', data: new Int16Array(1) }])).toBe(
        ECG_DEFAULT_MV_PER_UNIT
      );
      expect(getECGMvPerUnit([])).toBe(ECG_DEFAULT_MV_PER_UNIT);
      expect(getECGMvPerUnit([{ mvPerUnit: 0 }, { mvPerUnit: 0.002 }])).toBe(
        0.002
      );
    });
  });

  describe('the grid agrees with the trace width', () => {
    function getMajorBlockSeconds(sweepSpeed, sensitivityMmMv) {
      const channels = [makeChannel('Lead I')];
      const metrics = computeECGRenderMetrics({
        canvas: makeCanvas(),
        visibleChannels: channels,
        windowMs: 10000,
        valueRange: [-1000, 1000],
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

      const spacing = verticalMajorX[1] - verticalMajorX[0];

      return spacing / metrics.pxPerSecond;
    }

    it('gives a major block 0.2 s at 25 mm/s when calibrated', () => {
      expect(getMajorBlockSeconds(25, 10)).toBeCloseTo(0.2, 6);
    });

    it('gives a major block 0.1 s at 50 mm/s when calibrated', () => {
      expect(getMajorBlockSeconds(50, 10)).toBeCloseTo(0.1, 6);
    });

    it('gives a major block 0.2 s when the amplitude auto-fits', () => {
      // The defect lived here: the width came from the sweep speed while the
      // grid came from the deprecated ECG_SECONDS_WIDTH, so a major block
      // covered 0.317 s.
      expect(getMajorBlockSeconds(25, undefined)).toBeCloseTo(0.2, 6);
    });

    it('reports the pixels for each second that produced the width', () => {
      const metrics = computeECGRenderMetrics({
        canvas: makeCanvas(),
        visibleChannels: [makeChannel('Lead I')],
        windowMs: 10000,
        valueRange: [-1000, 1000],
      });

      expect(metrics.sweepSpeed).toBe(ECG_DEFAULT_SWEEP_SPEED_MM_S);
      expect(metrics.pxPerSecond).toBeCloseTo(
        ECG_DEFAULT_SWEEP_SPEED_MM_S * ECG_PX_PER_MM,
        6
      );
      expect(metrics.ecgWidth).toBe(Math.ceil(10 * metrics.pxPerSecond));
    });
  });

  describe('a truncated channel', () => {
    it('draws no NaN when the channel is shorter than numberOfSamples', () => {
      // The waveform claims 1000 samples, and the channel holds 400.
      const channel = makeChannel('Lead I', { length: 400 });
      const layouts = computeECGChannelLayouts({
        visibleChannels: [channel],
        channelScale: 1,
        layoutType: '12x1',
        numberOfSamples: 1000,
        ecgWidth: 1000,
      });
      const ctx = makeRecordingContext();

      drawECGTraces({
        ctx,
        layouts,
        ecgWidth: 1000,
        channelScale: 1,
        startIndex: 0,
        endIndex: 1000,
      });

      const drawn = ctx.segments.filter((segment) => segment.to);
      expect(drawn.length).toBeGreaterThan(0);
      drawn.forEach((segment) => {
        expect(Number.isNaN(segment.to[0])).toBe(false);
        expect(Number.isNaN(segment.to[1])).toBe(false);
      });
    });

    it('still draws the baseline for a cell with no samples in its window', () => {
      const channel = makeChannel('Lead I', { length: 100 });
      const layouts = computeECGChannelLayouts({
        visibleChannels: [channel],
        channelScale: 1,
        layoutType: '12x1',
        numberOfSamples: 1000,
        ecgWidth: 1000,
      });
      layouts[0].startSample = 500;
      layouts[0].endSample = 1000;

      const ctx = makeRecordingContext();

      drawECGTraces({ ctx, layouts, ecgWidth: 1000, channelScale: 1 });

      const baselines = ctx.segments.filter(
        (segment) =>
          segment.style === ECG_RENDERING_COLORS.baseline && segment.to
      );
      expect(baselines.length).toBe(1);
      expect(Number.isNaN(baselines[0].to[1])).toBe(false);
    });
  });
});
