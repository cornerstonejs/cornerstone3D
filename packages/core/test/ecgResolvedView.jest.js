import ECGResolvedView from '../src/RenderingEngine/GenericViewport/ECG/ECGResolvedView';
import { computeECGRenderMetrics } from '../src/utilities/ECGUtilities';

const SAMPLING_FREQUENCY = 500;
const NUMBER_OF_SAMPLES = 5000;
const DURATION_MS = (NUMBER_OF_SAMPLES / SAMPLING_FREQUENCY) * 1000;

const LEAD_NAMES = [
  'Lead I',
  'Lead II',
  'Lead III',
  'aVR',
  'aVL',
  'aVF',
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
];

function makeCanvas(width = 800, height = 600) {
  return { clientWidth: width, clientHeight: height, width, height };
}

function makeWaveform() {
  return {
    id: 'ecg:1',
    type: 'ecg',
    channels: LEAD_NAMES.map((name) => ({
      name,
      data: new Int16Array(NUMBER_OF_SAMPLES),
      min: -1000,
      max: 1000,
      mvPerUnit: 0.001,
    })),
    numberOfChannels: LEAD_NAMES.length,
    numberOfSamples: NUMBER_OF_SAMPLES,
    samplingFrequency: SAMPLING_FREQUENCY,
    bitsAllocated: 16,
    sampleInterpretation: 'SS',
  };
}

function makeView({
  timeRange = [0, DURATION_MS],
  valueRange = [-1000, 1000],
  scale = 1,
  dataPresentation = undefined,
  canvas = makeCanvas(),
} = {}) {
  return new ECGResolvedView({
    viewState: {
      timeRange,
      valueRange,
      scale,
      scaleMode: 'fit',
      rotation: 0,
      anchorCanvas: [0.5, 0.5],
      scrollOffset: 0,
    },
    canvas,
    dataPresentation,
    frameOfReferenceUID: 'ecg-viewport-test',
    waveform: makeWaveform(),
  });
}

describe('ECGResolvedView owns the world geometry', () => {
  it('computes real metrics without any draw', () => {
    const view = makeView();

    // The render path used to own the metrics, and a resolved view built before
    // the first draw reported the placeholder {1, 1, 1}.
    expect(view.metrics.ecgWidth).toBeGreaterThan(1);
    expect(view.metrics.ecgHeight).toBeGreaterThan(1);
    expect(view.metrics.channelScale).toBeGreaterThan(0);
    expect(view.metrics.pxPerSecond).toBeGreaterThan(1);
  });

  it('agrees with computeECGRenderMetrics for the same inputs', () => {
    const canvas = makeCanvas();
    const waveform = makeWaveform();
    const view = makeView({ canvas });
    const expected = computeECGRenderMetrics({
      canvas,
      visibleChannels: waveform.channels,
      windowMs: DURATION_MS,
      valueRange: [-1000, 1000],
      layoutType: '12x1',
    });

    expect(view.metrics).toEqual(expected);
  });

  it('gives a layout cell for every visible lead', () => {
    expect(makeView().channelLayouts).toHaveLength(LEAD_NAMES.length);
  });

  it('derives the layout from its own metrics', () => {
    const view = makeView();
    const widths = new Set(view.channelLayouts.map((layout) => layout.width));

    // A 12x1 layout gives each lead the full world width.
    expect(widths.size).toBe(1);
    expect(widths.has(view.metrics.ecgWidth)).toBe(true);
  });

  describe('the geometry answers a state change at once', () => {
    it('changes the world width when the time window narrows', () => {
      const whole = makeView();
      const half = makeView({ timeRange: [0, DURATION_MS / 2] });

      expect(half.metrics.ecgWidth).toBeLessThan(whole.metrics.ecgWidth);
      // `ecgWidth` rounds up to a whole pixel, so allow one pixel of slack.
      expect(
        Math.abs(half.metrics.ecgWidth - whole.metrics.ecgWidth / 2)
      ).toBeLessThanOrEqual(1);
    });

    it('changes the amplitude scale when the sensitivity changes', () => {
      const autoFit = makeView();
      const calibrated = makeView({
        dataPresentation: { sensitivityMmMv: 10 },
      });

      expect(calibrated.metrics.channelScale).not.toBeCloseTo(
        autoFit.metrics.channelScale,
        6
      );
    });

    it('changes the layout when the arrangement changes', () => {
      const rows = makeView({ dataPresentation: { layoutType: '12x1' } });
      const grid = makeView({ dataPresentation: { layoutType: '3x4+1' } });

      // The 3x4+1 layout adds the rhythm strip, so it holds one more cell.
      expect(grid.channelLayouts).toHaveLength(rows.channelLayouts.length + 1);
      expect(grid.channelLayouts.some((layout) => layout.isRhythm)).toBe(true);

      // The auto-fit amplitude fills the canvas whatever the layout, so
      // `ecgHeight` is the same for both. The row height is what changes: 4
      // rows are taller than 12 rows.
      expect(grid.metrics.ecgHeight).toBeCloseTo(rows.metrics.ecgHeight, 6);
      expect(grid.channelLayouts[0].itemHeight).toBeGreaterThan(
        rows.channelLayouts[0].itemHeight * 2
      );

      // A 3x4 grid cell shows one quarter of the signal; a 12x1 row shows all
      // of it.
      expect(grid.channelLayouts[0].width).toBeCloseTo(
        grid.metrics.ecgWidth / 4,
        6
      );
      expect(rows.channelLayouts[0].width).toBeCloseTo(
        rows.metrics.ecgWidth,
        6
      );
    });

    it('changes the world width when the sweep speed changes', () => {
      const slow = makeView({ dataPresentation: { sweepSpeed: 25 } });
      const fast = makeView({ dataPresentation: { sweepSpeed: 50 } });

      expect(fast.metrics.ecgWidth).toBeCloseTo(slow.metrics.ecgWidth * 2, 0);
    });
  });

  describe('the transforms use the same geometry that the render path draws', () => {
    it('round trips a point of every layout cell', () => {
      const view = makeView({ dataPresentation: { layoutType: '3x4+1' } });

      view.channelLayouts.forEach((layout) => {
        const sampleIndex = (layout.startSample + layout.endSample) / 2;
        const world = [sampleIndex, 100, layout.leadIndex];
        const canvasPoint = view.worldToCanvas(world);
        const back = view.canvasToWorld(canvasPoint);

        expect(back[0]).toBeCloseTo(world[0], 3);
        expect(back[1]).toBeCloseTo(world[1], 3);
        expect(back[2]).toBe(world[2]);
      });
    });

    it('maps the canvas centre inside the world', () => {
      const canvas = makeCanvas();
      const view = makeView({ canvas });
      const world = view.canvasToWorld([
        canvas.clientWidth / 2,
        canvas.clientHeight / 2,
      ]);

      expect(world[0]).toBeGreaterThanOrEqual(0);
      expect(world[0]).toBeLessThanOrEqual(NUMBER_OF_SAMPLES - 1);
      expect(Number.isNaN(world[1])).toBe(false);
    });

    it('reports a canvas transform that matches the mapping', () => {
      const view = makeView();
      const transform = view.canvasTransform;

      expect(transform.effectiveRatio).toBeGreaterThan(0);
      expect(Number.isFinite(transform.xOffset)).toBe(true);
      expect(Number.isFinite(transform.yOffset)).toBe(true);

      // A world point transformed by hand must match worldToCanvas.
      const layout = view.channelLayouts[0];
      const worldX = layout.startSample;
      const canvasPoint = view.worldToCanvas([worldX, 0, layout.leadIndex]);
      const expectedX =
        (layout.xOffset ?? 0) * transform.effectiveRatio + transform.xOffset;

      expect(canvasPoint[0]).toBeCloseTo(expectedX, 6);
    });

    it('keeps the zoom in the effective ratio', () => {
      const plain = makeView();
      const zoomed = makeView({ scale: 2 });

      expect(zoomed.canvasTransform.effectiveRatio).toBeCloseTo(
        plain.canvasTransform.effectiveRatio * 2,
        6
      );
      expect(zoomed.zoom).toBe(2);
    });
  });

  it('computes each derived value once', () => {
    const view = makeView();

    expect(view.metrics).toBe(view.metrics);
    expect(view.channelLayouts).toBe(view.channelLayouts);
  });

  it('reports the frame of reference', () => {
    expect(makeView().getFrameOfReferenceUID()).toBe('ecg-viewport-test');
  });

  it('builds a legacy camera from its own geometry', () => {
    const camera = makeView().toICamera();

    expect(camera.parallelProjection).toBe(true);
    expect(camera.parallelScale).toBeGreaterThan(0);
    expect(camera.focalPoint.every((value) => Number.isFinite(value))).toBe(
      true
    );
  });
});
