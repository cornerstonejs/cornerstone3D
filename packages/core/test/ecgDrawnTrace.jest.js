/**
 * The render path draws the trace with the transform of the resolved view, so
 * the trace, the grid and `worldToCanvas` agree (GENVIEW-VIEW-6).
 */
import ECGViewport from '../src/RenderingEngine/GenericViewport/ECG/ECGViewport';
import { ECG_PX_PER_MM } from '../src/RenderingEngine/GenericViewport/ECG/ecgWaveform';

const FS = 500;
const N = 5000;

function makeWaveform(id, leadCount, samples = N) {
  return {
    id,
    type: 'ecg',
    channels: Array.from({ length: leadCount }, (_, c) => {
      const data = new Int16Array(samples);
      for (let i = 0; i < samples; i++) {
        data[i] = Math.round(800 * Math.sin(i / 20));
      }
      return { name: `L${c}`, data, min: -800, max: 800, mvPerUnit: 0.001 };
    }),
    numberOfChannels: leadCount,
    numberOfSamples: samples,
    samplingFrequency: FS,
    bitsAllocated: 16,
    sampleInterpretation: 'SS',
  };
}

/** A 2D context that records the transform and the trace polyline. */
function makeRecordingContext() {
  const rec = {
    transform: [1, 0, 0, 1, 0, 0],
    traceTransform: null,
    trace: [],
    strokeStyle: '',
  };
  const ctx = {
    canvas: null,
    globalAlpha: 1,
    fillStyle: '',
    lineWidth: 1,
    font: '',
    get strokeStyle() {
      return rec.strokeStyle;
    },
    set strokeStyle(value) {
      rec.strokeStyle = value;
    },
    resetTransform() {
      rec.transform = [1, 0, 0, 1, 0, 0];
    },
    setTransform(a, b, c, d, e, f) {
      rec.transform = [a, b, c, d, e, f];
    },
    fillRect() {},
    fillText() {},
    measureText: () => ({ width: 10 }),
    save() {},
    restore() {},
    rect() {},
    clip() {},
    beginPath() {},
    stroke() {},
    moveTo(x, y) {
      if (rec.strokeStyle === '#ffffff') {
        rec.traceTransform = rec.transform.slice();
        rec.trace.push([x, y]);
      }
    },
    lineTo(x, y) {
      if (rec.strokeStyle === '#ffffff') {
        rec.trace.push([x, y]);
      }
    },
  };
  return { ctx, rec };
}

let recording;
const originalGetContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  recording = makeRecordingContext();
  HTMLCanvasElement.prototype.getContext = () => recording.ctx;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

async function makeViewport(waveforms, viewState) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const viewport = new ECGViewport({
    id: `vp-${Math.random()}`,
    element,
    renderingEngineId: 're',
    dataProvider: { load: async (id) => waveforms[id] },
  });
  Object.defineProperty(viewport.canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(viewport.canvas, 'clientHeight', { value: 600 });
  await viewport.setDisplaySets({ displaySetId: Object.keys(waveforms)[0] });
  if (viewState) {
    viewport.setViewState(viewState);
  }
  return viewport;
}

/** Canvas (CSS px) position of trace point `index`, as the render path drew it. */
function drawnCanvasPoint(index) {
  const [a, , , d, e, f] = recording.rec.traceTransform;
  const [x, y] = recording.rec.trace[index];
  const dpr = window.devicePixelRatio || 1;
  return [(a * x + e) / dpr, (d * y + f) / dpr];
}

/**
 * Renders, and compares the drawn position of sample `sample` of lead 0 with
 * the `worldToCanvas` answer that a tool uses.
 */
function compareDrawnWithTool(viewport, sample) {
  recording.rec.trace.length = 0;
  viewport.render();
  const view = viewport.getResolvedView();
  const layout = view.channelLayouts.find((item) => item.leadIndex === 0);
  const waveform = viewport.getWaveformData();
  const value = waveform.channels[0].data[sample];
  const drawn = drawnCanvasPoint(sample - layout.startSample);
  const tool = viewport.worldToCanvas([sample, value, 0]);
  const t = recording.rec.traceTransform;
  return {
    drawn,
    tool,
    dx: drawn[0] - tool[0],
    dy: drawn[1] - tool[1],
    scaleX: t[0],
    scaleY: t[3],
  };
}

describe('ECG drawn trace', () => {
  it.each([
    ['auto-fit at 25 mm/s', {}],
    ['50 mm/s', { traceLayout: '12x1', sweepSpeed: 50 }],
    ['20 mm/mV', { traceLayout: '12x1', sensitivityMmMv: 20 }],
    ['10 mm/mV at zoom 1', { traceLayout: '12x1', sensitivityMmMv: 10 }],
  ])('draws the trace where a tool finds it: %s', async (_name, viewState) => {
    const viewport = await makeViewport(
      { a: makeWaveform('a', 12) },
      viewState
    );
    const result = compareDrawnWithTool(viewport, 31);

    expect(Math.abs(result.dx)).toBeLessThan(0.5);
    expect(Math.abs(result.dy)).toBeLessThan(0.5);
    expect(result.scaleX).toBeCloseTo(result.scaleY, 9);
  });

  it('reads 1 mV and 1 s off the grid at the set sensitivity and sweep speed', async () => {
    const waveform = makeWaveform('a', 1);
    waveform.channels[0].data.fill(0);
    waveform.channels[0].data[FS] = 1000; // 1 mV at 0.001 mV for each unit
    const viewport = await makeViewport(
      { a: waveform },
      { traceLayout: '12x1', sensitivityMmMv: 20, sweepSpeed: 50 }
    );
    recording.rec.trace.length = 0;
    viewport.render();
    const trace = recording.rec.trace;
    const { pxPerSecond, sweepSpeed } = viewport.getResolvedView().metrics;

    expect(Math.abs(trace[FS][1] - trace[0][1]) / ECG_PX_PER_MM).toBeCloseTo(
      20,
      1
    );
    expect(
      Math.abs(trace[FS][0] - trace[0][0]) / (pxPerSecond / sweepSpeed)
    ).toBeCloseTo(50, 1);
  });

  it('covers the whole canvas with the grid, at one scale', async () => {
    const viewport = await makeViewport(
      { a: makeWaveform('a', 12) },
      { traceLayout: '12x1', sensitivityMmMv: 10 }
    );
    const view = viewport.getResolvedView();
    const { minX, minY, maxX, maxY } = view.canvasBounds;

    expect(view.worldToCanvas([0, 0, 0])).toBeDefined();
    expect((maxX - minX) * view.canvasTransform.effectiveRatio).toBeCloseTo(
      800,
      6
    );
    expect((maxY - minY) * view.canvasTransform.effectiveRatio).toBeCloseTo(
      600,
      6
    );
  });
});
