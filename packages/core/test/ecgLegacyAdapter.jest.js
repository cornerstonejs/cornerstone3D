import { describe, it, expect } from '@jest/globals';
import ECGViewportLegacyAdapter from '../src/RenderingEngine/GenericViewport/ECG/ECGViewportLegacyAdapter';

const SAMPLES = 1000;

/** A waveform of two leads. */
function makeWaveform() {
  return {
    id: 'ecg:1',
    type: 'ecg',
    channels: ['I', 'II'].map((name) => ({
      name,
      data: new Int16Array(SAMPLES),
      min: -100,
      max: 100,
      mvPerUnit: 0.001,
    })),
    numberOfChannels: 2,
    numberOfSamples: SAMPLES,
    samplingFrequency: 500,
    bitsAllocated: 16,
    sampleInterpretation: 'SS',
  };
}

/** Makes an ECG legacy adapter on a canvas of a known size with a waveform. */
async function makeViewport(defaultOptions) {
  const element = document.createElement('div');

  document.body.appendChild(element);

  const viewport = new ECGViewportLegacyAdapter({
    id: 'ecg',
    element,
    renderingEngineId: 'renderingEngine',
    dataProvider: { load: async () => makeWaveform() },
    defaultOptions,
  });

  Object.defineProperty(viewport.canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(viewport.canvas, 'clientHeight', { value: 600 });
  await viewport.setDisplaySets({ displaySetId: 'ecg:1' });

  return viewport;
}

describe('ECG legacy adapter', () => {
  it('gives one slice, as the legacy viewport', async () => {
    const viewport = await makeViewport();

    expect(viewport.getNumberOfSlices()).toBe(1);
  });

  it('has the legacy options and actor members', async () => {
    const viewport = await makeViewport({
      background: [0, 0, 0],
      suppressEvents: true,
      traceLayout: '6x2',
    });

    expect(viewport.uid).toBe('ecg');
    expect(viewport.isDisabled).toBe(false);
    expect(viewport.suppressEvents).toBe(true);
    expect(viewport.defaultOptions.traceLayout).toBe('6x2');
    expect(viewport.getViewState().traceLayout).toBe('6x2');
    expect(viewport.options).toEqual(viewport.defaultOptions);
    expect(viewport.options).not.toBe(viewport.defaultOptions);

    viewport.setOptions({ background: [1, 1, 1] });
    expect(viewport.options).toEqual({ background: [1, 1, 1] });
    expect(viewport.getDisplayArea()).toBeUndefined();

    viewport.reset();
    expect(viewport.options).toEqual(viewport.defaultOptions);

    expect(viewport.getActors()).toEqual([]);
    expect(viewport.getDefaultActor()).toBeUndefined();
    expect(viewport.getActor('any')).toBeUndefined();
    expect(viewport.isOrientationChangeable()).toBe(false);
    viewport.destroy();
  });

  it('gives empty options without default options', async () => {
    const viewport = await makeViewport();

    expect(viewport.defaultOptions).toEqual({});
    expect(viewport.options).toEqual({});
    expect(viewport.suppressEvents).toBe(false);
    viewport.destroy();
  });

  it('takes a canvas point or the legacy flag as the second zoom argument', async () => {
    const viewport = await makeViewport();
    const focalPoint = viewport.getCamera().focalPoint;

    viewport.setZoom(2, true);

    expect(viewport.getZoom()).toBeCloseTo(2);
    expect(viewport.getCamera().focalPoint[0]).toBeCloseTo(focalPoint[0]);
    expect(viewport.getCamera().focalPoint[1]).toBeCloseTo(focalPoint[1]);

    const anchor = viewport.canvasToWorld([100, 100]);

    viewport.setZoom(3, [100, 100]);

    expect(viewport.getZoom()).toBeCloseTo(3);
    expect(viewport.canvasToWorld([100, 100])[0]).toBeCloseTo(anchor[0]);
    expect(viewport.canvasToWorld([100, 100])[1]).toBeCloseTo(anchor[1]);
    viewport.destroy();
  });
});
