import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import { Events, MetadataModules, ViewportType } from '../src/enums';
import * as metaData from '../src/metaData';
import LegacyECGViewport from '../src/RenderingEngine/ECGViewport';
import ECGViewport from '../src/RenderingEngine/GenericViewport/ECG/ECGViewport';
import { viewportProjection } from '../src/RenderingEngine/GenericViewport/viewportProjection';
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

async function mountLegacy(defaultOptions = {}) {
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
    defaultOptions,
  });

  await viewport.setEcg(ECG_ID);
  mounted.push(element);

  return viewport;
}

async function mountNext(viewState, defaultOptions) {
  const { element } = createElement();
  const viewport = new ECGViewport({
    id: 'ecgNext',
    element,
    renderingEngineId: 'renderingEngine',
    defaultOptions,
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
});

/** The layout cell of the next viewport whose rectangle holds a canvas point. */
function cellAt(viewport, canvasPoint) {
  const resolvedView = viewport.getResolvedView();
  const { effectiveRatio, xOffset, yOffset } = resolvedView.canvasTransform;
  const x = (canvasPoint[0] - xOffset) / effectiveRatio;
  const y = (canvasPoint[1] - yOffset) / effectiveRatio;

  return resolvedView.channelLayouts.find(
    (cell) =>
      x >= cell.xOffset &&
      x <= cell.xOffset + cell.width &&
      y >= cell.yOffset - cell.itemHeight &&
      y <= cell.yOffset
  );
}

/** The canvas point at the middle of a layout cell of the next viewport. */
function middleOfCell(viewport, cell) {
  const { effectiveRatio, xOffset, yOffset } =
    viewport.getResolvedView().canvasTransform;

  return [
    (cell.xOffset + cell.width / 2) * effectiveRatio + xOffset,
    (cell.yOffset - cell.itemHeight / 2) * effectiveRatio + yOffset,
  ];
}

/** Clicks the next viewport at a canvas point, as a user does. */
function clickAt(viewport, canvasPoint) {
  viewport.element.dispatchEvent(
    new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: canvasPoint[0],
      clientY: canvasPoint[1],
    })
  );
}

/** The world point of a sample on the trace of a lead, at world Z `z`. */
function tracePoint(z, sample) {
  return [sample, DATA[z % 1000][sample], z];
}

function isDrawn(viewport, points) {
  return viewport.isReferenceViewable(
    viewport.getViewReference({ points: [points[0]] }),
    { points }
  );
}

describe('Annotations in a layout with several columns on the next ECG viewport', () => {
  const cellsOfLead = (viewport, channelIndex) =>
    viewport
      .getResolvedView()
      .channelLayouts.filter((cell) => cell.leadIndex % 1000 === channelIndex);

  it('does not draw a point outside the time window of every cell of its lead', async () => {
    const legacy = await mountLegacy();
    const next = await mountNext();
    const [probe] = annotationPoints(legacy, 7, [1400]);
    const [v2] = cellsOfLead(next, 7);

    expect([v2.startSample, v2.endSample]).toEqual([2500, 3750]);
    expect(isDrawn(next, [probe])).toBe(false);

    next.setViewState({ traceLayout: '6x2' });

    expect(
      cellsOfLead(next, 7).map((cell) => [cell.startSample, cell.endSample])
    ).toEqual([[2500, 5000]]);
    expect(isDrawn(next, [probe])).toBe(false);
  });

  it('draws a point in the cell of its lead that holds the sample, and reads it back', async () => {
    const next = await mountNext();
    const point = tracePoint(7, 3000);
    const canvasPoint = next.worldToCanvas(point);

    expect(isDrawn(next, [point])).toBe(true);
    expect(cellAt(next, canvasPoint).leadIndex).toBe(7);
    expectClose(next.canvasToWorld(canvasPoint), point);
  });

  it('draws a point of a lead outside its grid cell in the rhythm strip of the same lead', async () => {
    const next = await mountNext();
    const [grid, rhythm] = cellsOfLead(next, 1);
    const point = tracePoint(1, 2000);
    const canvasPoint = next.worldToCanvas(point);

    expect([grid.startSample, grid.endSample]).toEqual([0, 1250]);
    expect([rhythm.startSample, rhythm.endSample]).toEqual([0, 5000]);
    expect(isDrawn(next, [point])).toBe(true);
    expect(cellAt(next, canvasPoint).regionIndex).toBe(rhythm.regionIndex);
    expectClose(next.canvasToWorld(canvasPoint), [
      point[0],
      point[1],
      rhythm.leadIndex,
    ]);
  });

  it('draws a point that two cells hold in the cell that the user last clicked in, else in the first', async () => {
    const next = await mountNext();
    const [grid, rhythm] = cellsOfLead(next, 1);
    const point = tracePoint(1, 1000);
    const cellOf = () => cellAt(next, next.worldToCanvas(point)).regionIndex;

    expect(cellOf()).toBe(grid.regionIndex);
    expectClose(next.canvasToWorld(next.worldToCanvas(point)), point);

    clickAt(next, middleOfCell(next, rhythm));

    expect(cellOf()).toBe(rhythm.regionIndex);

    clickAt(next, middleOfCell(next, grid));

    expect(cellOf()).toBe(grid.regionIndex);
  });

  it('draws an annotation with points in two windows where all of its points show', async () => {
    const next = await mountNext();
    const [grid, rhythm] = cellsOfLead(next, 1);
    const length = [tracePoint(1, 500), tracePoint(1, 2000)];

    clickAt(next, middleOfCell(next, grid));

    expect(isDrawn(next, length)).toBe(true);
    length.forEach((point) =>
      expect(cellAt(next, next.worldToCanvas(point)).regionIndex).toBe(
        rhythm.regionIndex
      )
    );

    const inGrid = [tracePoint(1, 500), tracePoint(1, 1000)];

    expect(isDrawn(next, inGrid)).toBe(true);
    inGrid.forEach((point) =>
      expect(cellAt(next, next.worldToCanvas(point)).regionIndex).toBe(
        grid.regionIndex
      )
    );
  });

  it('does not draw an annotation that no one cell of its lead shows whole', async () => {
    const next = await mountNext();

    expect(isDrawn(next, [tracePoint(7, 1400), tracePoint(7, 3000)])).toBe(
      false
    );
    expect(isDrawn(next, [tracePoint(7, 2600), tracePoint(7, 3000)])).toBe(
      true
    );
  });

  it('keeps the legacy layout 12x1 as the legacy viewport draws it', async () => {
    const legacy = await mountLegacy();
    const next = await mountNext({ traceLayout: '12x1' });

    [
      [1, [300, 4900]],
      [7, [1400, 1800]],
    ].forEach(([lead, samples]) => {
      const points = annotationPoints(legacy, lead, samples);

      expect(isDrawn(next, points)).toBe(true);
      points.forEach((point) => {
        expectClose(next.canvasToWorld(next.worldToCanvas(point)), point);
        expect(cellAt(next, next.worldToCanvas(point)).leadIndex).toBe(lead);
      });
    });
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

describe('Zoom and pan of the next ECG viewport in the projection service', () => {
  it('gives the zoom and the pan of the members, and moves the view as the members do, which is how the tools move it', async () => {
    const byMembers = await mountNext();
    const byService = await mountNext();
    const anchorCanvas = [50, 40];

    byMembers.setZoom(2, anchorCanvas);
    byService.setViewState(
      viewportProjection.withPresentation(byService, { zoom: 2 }, undefined, {
        anchorCanvas,
      })
    );

    const { pan, zoom } = viewportProjection.getPresentation(byService, {
      selector: { zoom: true, pan: true },
    });

    expect(zoom).toBeCloseTo(byMembers.getZoom(), 9);
    expectClose([pan[0] * zoom, pan[1] * zoom], byMembers.getPan(), 6);

    byMembers.setPan([byMembers.getPan()[0] + 12, byMembers.getPan()[1] - 7]);
    byService.setViewState(
      viewportProjection.withPresentation(byService, {
        pan: [pan[0] + 12 / zoom, pan[1] - 7 / zoom],
      })
    );

    expectClose(byService.getPan(), byMembers.getPan(), 6);
    expectClose(
      byService.canvasToWorld([120, 80]),
      byMembers.canvasToWorld([120, 80]),
      6
    );
  });
});

describe('suppressEvents on the direct next ECG viewport', () => {
  /** Counts the camera events of a viewport. */
  function countCameraEvents(viewport) {
    const counts = { modified: 0, reset: 0 };

    viewport.element.addEventListener(Events.CAMERA_MODIFIED, () => {
      counts.modified++;
    });
    viewport.element.addEventListener(Events.CAMERA_RESET, () => {
      counts.reset++;
    });

    return counts;
  }

  it('fires no camera event with suppressEvents in the options, as the legacy viewport fires none', async () => {
    const defaultOptions = { suppressEvents: true };
    const legacy = await mountLegacy(defaultOptions);
    const next = await mountNext(undefined, defaultOptions);
    const legacyCounts = countCameraEvents(legacy);
    const nextCounts = countCameraEvents(next);

    legacy.setCamera({ ...legacy.getCamera(), parallelScale: 10 });
    legacy.resetCamera();
    next.setPan([12, 5]);
    next.setZoom(2);
    next.resetViewState();

    expect(next.defaultOptions.suppressEvents).toBe(true);
    expect('suppressEvents' in next).toBe(false);
    expect(legacyCounts).toEqual({ modified: 0, reset: 0 });
    expect(nextCounts).toEqual(legacyCounts);
  });

  it('still fires the camera events without suppressEvents', async () => {
    const next = await mountNext();
    const nextCounts = countCameraEvents(next);

    next.setPan([12, 5]);
    next.resetViewState();

    expect(next.defaultOptions.suppressEvents).toBeUndefined();
    expect('suppressEvents' in next).toBe(false);
    expect(nextCounts.modified).toBeGreaterThan(0);
    expect(nextCounts.reset).toBe(1);
  });
});
