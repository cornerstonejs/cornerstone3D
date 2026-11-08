import ECGViewportLegacyAdapter from '../src/RenderingEngine/GenericViewport/ECG/ECGViewportLegacyAdapter';
import * as metaData from '../src/metaData';

const N = 5000;
const NAMES = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'];

function makeWaveform() {
  return {
    id: 'ecg:1',
    type: 'ecg',
    channels: NAMES.map((name) => {
      const data = new Int16Array(N);
      for (let i = 0; i < N; i++) data[i] = Math.round(800 * Math.sin(i / 20));
      return { name, data, min: -800, max: 800, mvPerUnit: 0.001 };
    }),
    numberOfChannels: NAMES.length,
    numberOfSamples: N,
    samplingFrequency: 500,
    bitsAllocated: 16,
    sampleInterpretation: 'SS',
  };
}

async function makeViewport(id = 'vp') {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const viewport = new ECGViewportLegacyAdapter({
    id,
    element,
    renderingEngineId: 're',
    dataProvider: { load: async () => makeWaveform() },
  });
  Object.defineProperty(viewport.canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(viewport.canvas, 'clientHeight', { value: 600 });
  await viewport.setDisplaySets({ displaySetId: 'ecg:1' });
  return viewport;
}

describe('ECG viewport references and camera', () => {
  it('does not show an annotation of a lead that the layout hides', async () => {
    const viewport = await makeViewport();
    const reference = viewport.getViewReference({ points: [[100, 0, 0]] });

    expect(reference.sliceIndex).toBe(0);
    expect(viewport.isReferenceViewable(reference)).toBe(true);

    viewport.setViewState({ visibleChannels: [1, 2, 3, 4, 5] });

    expect(viewport.isReferenceViewable(reference)).toBe(false);
    // A reference to the whole record stays viewable.
    expect(viewport.isReferenceViewable(viewport.getViewReference())).toBe(
      true
    );
  });

  it('shows an annotation in every viewport of the same ECG', async () => {
    const provider = (type, imageId) =>
      type === 'sopCommonModule' && imageId === 'ecg:1'
        ? { sopInstanceUID: '1.2.3.4' }
        : undefined;
    metaData.addProvider(provider, 100000);
    try {
      const viewportA = await makeViewport('vpA');
      const viewportB = await makeViewport('vpB');
      const reference = viewportA.getViewReference({ points: [[100, 0, 2]] });

      expect(reference.FrameOfReferenceUID).toBe('1.2.3.4');
      expect(viewportB.isReferenceViewable(reference)).toBe(true);
    } finally {
      metaData.removeProvider(provider);
    }
  });

  it('keeps the view when a saved camera is restored past the record end', async () => {
    const viewport = await makeViewport();
    viewport.setZoom(4);
    const endCanvas = viewport.worldToCanvas([N - 1, 0, 0]);
    viewport.setPan([viewport.getPan()[0] + (300 - endCanvas[0]), 0]);
    const panBefore = viewport.getPan();

    viewport.setCamera(viewport.getCamera());

    expect(viewport.getPan()[0]).toBeCloseTo(panBefore[0], 3);
    expect(viewport.getPan()[1]).toBeCloseTo(panBefore[1], 3);
  });

  it('defaults to auto layout and renders 12-lead ECG as 3x4+1 with rhythm strip', async () => {
    const twelveNames = [
      'I',
      'II',
      'III',
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
    const waveform12 = {
      id: 'ecg:12',
      type: 'ecg',
      channels: twelveNames.map((name) => ({
        name,
        code: name,
        data: new Int16Array(N),
        min: -500,
        max: 500,
        mvPerUnit: 0.001,
      })),
      numberOfChannels: 12,
      numberOfSamples: N,
      samplingFrequency: 500,
      bitsAllocated: 16,
      sampleInterpretation: 'SS',
    };

    const element = document.createElement('div');
    document.body.appendChild(element);
    const viewport = new ECGViewportLegacyAdapter({
      id: 'vp12',
      element,
      renderingEngineId: 're12',
      dataProvider: { load: async () => waveform12 },
    });
    Object.defineProperty(viewport.canvas, 'clientWidth', { value: 800 });
    Object.defineProperty(viewport.canvas, 'clientHeight', { value: 600 });
    await viewport.setDisplaySets({ displaySetId: 'ecg:12' });

    expect(viewport.getViewState().traceLayout).toBe('3x4+1');
    const resolved = viewport.getResolvedView();
    expect(resolved?.channelLayouts).toHaveLength(13);
    expect(viewport.getTraceLayoutNames()[0]).toBe('3x4+1');
  });

  describe('clinical sweep speed and sensitivity controls', () => {
    it('provides clinical speed and sensitivity presets', async () => {
      const viewport = await makeViewport('vp-clinical');

      expect(viewport.getClinicalSweepSpeeds()).toEqual([12.5, 25, 50]);
      expect(viewport.getClinicalSensitivities()).toEqual([2.5, 5, 10, 20]);
    });

    it('updates sweep speed and sensitivity via viewport API methods', async () => {
      const viewport = await makeViewport('vp-speed-sens');

      // Default speed is 25 mm/s
      expect(viewport.getSweepSpeed()).toBe(25);

      // Change speed to 50 mm/s
      viewport.setSweepSpeed(50);
      expect(viewport.getSweepSpeed()).toBe(50);
      expect(viewport.getViewState().sweepSpeed).toBe(50);

      // Change sensitivity to 20 mm/mV
      viewport.setSensitivity(20);
      expect(viewport.getSensitivity()).toBe(20);
      expect(viewport.getViewState().sensitivityMmMv).toBe(20);

      // Reset sensitivity to undefined (auto-fit mode)
      viewport.setSensitivity(undefined);
      expect(viewport.getSensitivity()).toBeUndefined();
      expect(viewport.getViewState().sensitivityMmMv).toBeUndefined();
    });
  });
});
