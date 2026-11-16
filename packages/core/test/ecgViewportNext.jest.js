import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import { MetadataModules, ViewportType } from '../src/enums';
import * as metaData from '../src/metaData';
import LegacyECGViewport from '../src/RenderingEngine/ECGViewport';
import ECGViewport from '../src/RenderingEngine/GenericViewport/ECG/ECGViewport';
import { ECG_PX_PER_MM } from '../src/RenderingEngine/GenericViewport/ECG/ecgWaveform';

const ECG_ID = 'ecg:legacyNext';
const LEADS = [
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
const SAMPLING_FREQUENCY = 500;
const SAMPLES = 5000;
const WIDTH = 800;
const HEIGHT = 600;

/** The samples of a lead: a sine wave with a phase per lead, in microvolts. */
function leadData(lead) {
  const data = new Int16Array(SAMPLES);

  for (let i = 0; i < SAMPLES; i++) {
    data[i] = Math.round(800 * Math.sin(i / 20 + lead));
  }

  return data;
}

const DATA = LEADS.map((_, lead) => leadData(lead));

/** The ECG module of the record, as the DICOM metadata provider gives it. */
function ecgModuleProvider(type, imageId) {
  if (type !== MetadataModules.ECG || imageId !== ECG_ID) {
    return;
  }

  return {
    numberOfWaveformChannels: LEADS.length,
    numberOfWaveformSamples: SAMPLES,
    samplingFrequency: SAMPLING_FREQUENCY,
    channelDefinitionSequence: LEADS.map((codeMeaning) => ({
      channelSourceSequence: { codeMeaning },
      mvPerUnit: 0.001,
    })),
    waveformData: { retrieveBulkData: async () => DATA },
  };
}

/** Makes an element of the test size, with a canvas of the same size. */
function createElement() {
  const element = document.createElement('div');
  const viewportElement = document.createElement('div');
  const canvas = document.createElement('canvas');

  viewportElement.classList.add('viewport-element');
  canvas.classList.add('cornerstone-canvas');
  [element, canvas].forEach((node) => {
    Object.defineProperty(node, 'clientWidth', { value: WIDTH });
    Object.defineProperty(node, 'clientHeight', { value: HEIGHT });
    Object.defineProperty(node, 'offsetWidth', { value: WIDTH });
    Object.defineProperty(node, 'offsetHeight', { value: HEIGHT });
  });
  viewportElement.appendChild(canvas);
  element.appendChild(viewportElement);
  document.body.appendChild(element);

  return { element, canvas };
}

const mounted = [];

async function mountLegacy() {
  const { element, canvas } = createElement();
  const viewport = new LegacyECGViewport({
    id: 'ecgLegacy',
    element,
    canvas,
    renderingEngineId: 'renderingEngine',
    type: ViewportType.ECG,
    sx: 0,
    sy: 0,
    sWidth: WIDTH,
    sHeight: HEIGHT,
    defaultOptions: {},
  });

  await viewport.setEcg(ECG_ID);
  mounted.push(element);

  return viewport;
}

async function mountNext(viewState) {
  const { element } = createElement();
  const viewport = new ECGViewport({
    id: 'ecgNext',
    element,
    renderingEngineId: 'renderingEngine',
  });

  await viewport.setDisplaySets({ displaySetId: ECG_ID });

  if (viewState) {
    viewport.setViewState(viewState);
  }

  mounted.push(element);

  return viewport;
}

function expectClose(actual, expected, precision = 3) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], precision)
  );
}

/**
 * The world points that a probe on a sample and the two ends of a length
 * along the time axis store when a user puts them on the trace of a lead.
 */
function annotationPoints(viewport, lead, samples) {
  return samples.map((sample) =>
    viewport.canvasToWorld(
      viewport.worldToCanvas([sample, DATA[lead][sample], lead])
    )
  );
}

beforeEach(() => {
  metaData.addProvider(ecgModuleProvider, 100000);
});

afterEach(() => {
  metaData.removeProvider(ecgModuleProvider);
  mounted.splice(0).forEach((element) => element.remove());
});

describe('World coordinates of the legacy and the next ECG viewports', () => {
  it('measure the time axis in samples and the amplitude in raw units on both', async () => {
    const legacy = await mountLegacy();
    const next = await mountNext({ traceLayout: '12x1' });

    [
      [0, 100],
      [6, 2345],
      [11, 4990],
    ].forEach(([lead, sample]) => {
      const expected = [sample, DATA[lead][sample], lead];

      expectClose(annotationPoints(legacy, lead, [sample])[0], expected);
      expectClose(annotationPoints(next, lead, [sample])[0], expected);
    });
  });

  it('use 150 layout units for one second on legacy and the sweep speed times 3.779 on next', async () => {
    const legacy = await mountLegacy();
    const next = await mountNext({ traceLayout: '12x1' });
    const seconds = SAMPLES / SAMPLING_FREQUENCY;

    expect(ECG_PX_PER_MM).toBe(3.779);
    expect(legacy.getContentDimensions().width).toBe(150 * seconds);
    expect(next.getContentDimensions().width / seconds).toBeCloseTo(
      25 * ECG_PX_PER_MM,
      1
    );
  });

  it('show a legacy probe and a legacy length on the same samples on next in the legacy layout', async () => {
    const legacy = await mountLegacy();
    const next = await mountNext({ traceLayout: '12x1' });

    [
      [1, [300, 900]],
      [7, [1400, 1800]],
    ].forEach(([lead, samples]) => {
      const points = annotationPoints(legacy, lead, samples);
      const onNext = points.map((point) =>
        next.canvasToWorld(next.worldToCanvas(point))
      );

      onNext.forEach((point, index) => expectClose(point, points[index]));
      expect(onNext[1][0] - onNext[0][0]).toBeCloseTo(
        samples[1] - samples[0],
        3
      );
    });
  });

  it('keep an annotation on its samples on next when the sweep speed or the sensitivity change', async () => {
    const next = await mountNext({ traceLayout: '12x1' });
    const points = annotationPoints(next, 7, [1400, 1800]);

    [{ sweepSpeed: 50 }, { sensitivityMmMv: 20 }].forEach((viewState) => {
      next.setViewState(viewState);
      points.forEach((point) =>
        expectClose(next.canvasToWorld(next.worldToCanvas(point)), point)
      );
    });
  });

  /**
   * This pins the behaviour of today for the owner to decide on. A layout
   * with several columns shows each lead for a part of the record only. A
   * point of a lead outside that part is drawn in the cell of another lead,
   * and the reference stays viewable.
   */
  it('draws a point outside the time window of its lead in the cell of another lead', async () => {
    const legacy = await mountLegacy();
    const next = await mountNext();
    const [probe] = annotationPoints(legacy, 7, [1400]);
    const v2 = (viewport) =>
      viewport
        .getResolvedView()
        .channelLayouts.find((cell) => cell.leadIndex === 7);

    expect([v2(next).startSample, v2(next).endSample]).toEqual([2500, 3750]);
    expect(next.canvasToWorld(next.worldToCanvas(probe))[2]).toBe(4);

    next.setViewState({ traceLayout: '6x2' });

    expect([v2(next).startSample, v2(next).endSample]).toEqual([2500, 5000]);
    expect(next.canvasToWorld(next.worldToCanvas(probe))[2]).toBe(1);
    expect(
      next.isReferenceViewable(next.getViewReference({ points: [probe] }))
    ).toBe(true);
  });
});

describe('Slices of the next ECG viewport', () => {
  it('gives one slice, as the legacy viewport and the adapter do', async () => {
    const legacy = await mountLegacy();
    const next = await mountNext();

    expect(next.getNumberOfSlices()).toBe(legacy.getNumberOfSlices());
    expect(next.getNumberOfSlices()).toBe(1);
  });
});

describe('Annotations saved on a legacy ECG viewport', () => {
  it('show on the next viewport, as on the legacy viewport', async () => {
    const legacy = await mountLegacy();
    const next = await mountNext({ traceLayout: '12x1' });
    const [probe] = annotationPoints(legacy, 2, [500]);
    const references = [
      legacy.getViewReference(),
      legacy.getViewReference({ points: [probe] }),
      {
        ...legacy.getViewReference({ points: [probe] }),
        referencedImageId: legacy.getCurrentImageId(),
      },
    ];

    references.forEach((reference) => {
      expect(reference.viewPlaneNormal).toBeDefined();
      expect(reference.planeRestriction).toBeDefined();
      expect(legacy.isReferenceViewable(reference)).toBe(true);
      expect(next.isReferenceViewable(reference)).toBe(true);
    });
  });

  it('do not show on another record', async () => {
    const legacy = await mountLegacy();
    const next = await mountNext({ traceLayout: '12x1' });
    const reference = {
      ...legacy.getViewReference(),
      FrameOfReferenceUID: 'ecg:other',
    };

    expect(legacy.isReferenceViewable(reference)).toBe(false);
    expect(next.isReferenceViewable(reference)).toBe(false);
  });
});
