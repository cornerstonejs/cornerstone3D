import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  waitFor,
} from '../../../utils/test/testUtilsVideo';
import {
  createSeries,
  renderAndWait,
  showStack,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, metaData } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The pane of the start. */
const LARGE = [400, 300];

/**
 * A pane of another shape, on which the fit of every test picture is limited
 * by the width where it was limited by the height on the large pane, so a
 * kept camera and a kept zoom against the fit give two different views.
 */
const TALL = [250, 330];

/**
 * The planar views that `renderingEngine.resize()` fits to the new size in
 * place of keeping their camera (`PlanarViewport.keepCameraThroughResize`):
 * a view with a display area, and a scale mode other than `fit`. The scale
 * mode `fitAspect` is pinned by `planarFitAspectNext_test.js`.
 */
const PLANAR_VIEWS = [
  {
    name: 'a display area',
    viewState: { displayArea: { imageArea: [0.5, 0.5] } },
  },
  {
    name: "the scale mode 'absolute'",
    viewState: { scale: [1.5, 1.5], scaleMode: 'absolute' },
  },
  {
    name: "the scale mode 'fitWidth'",
    viewState: { scale: [1.5, 1.5], scaleMode: 'fitWidth' },
  },
  {
    name: "the scale mode 'fitHeight'",
    viewState: { scale: [1.5, 1.5], scaleMode: 'fitHeight' },
  },
];

/** Waits for the given number of animation frames. */
async function frames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Registers the metadata of an ECG of two channels of a sine of 100 samples
 * under an image id, for the ECG viewport.
 */
function addEcgMetadata(imageId) {
  const channelArrays = [0, 1].map(() =>
    Int16Array.from({ length: 100 }, (_, index) =>
      Math.round(1000 * Math.sin((index / 100) * Math.PI * 2))
    )
  );

  metaData.addProvider((type, requestedImageId) => {
    if (type !== Enums.MetadataModules.ECG || requestedImageId !== imageId) {
      return;
    }

    return {
      numberOfWaveformChannels: 2,
      numberOfWaveformSamples: 100,
      samplingFrequency: 500,
      waveformBitsAllocated: 16,
      waveformSampleInterpretation: 'SS',
      multiplexGroupLabel: 'ECG',
      channelDefinitionSequence: [
        { channelSourceSequence: { codeMeaning: 'Channel 1' } },
        { channelSourceSequence: { codeMeaning: 'Channel 2' } },
      ],
      waveformData: {
        retrieveBulkData: () => Promise.resolve(channelArrays),
      },
    };
  }, 100);
}

/** The world length of one canvas pixel at the centre of a viewport. */
function worldPerCanvasPixel(viewport) {
  const x = viewport.element.clientWidth / 2;
  const y = viewport.element.clientHeight / 2;
  const a = viewport.canvasToWorld([x, y]);
  const b = viewport.canvasToWorld([x + 1, y]);

  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Gives the element of a viewport a size and resizes the engine. */
async function resizeTo(renderingEngine, viewport, size, keepCamera) {
  viewport.element.style.width = `${size[0]}px`;
  viewport.element.style.height = `${size[1]}px`;
  renderingEngine.resize(true, keepCamera);
  await frames(3);
}

/**
 * The families that draw themselves (video, ECG): each makes a viewport of a
 * size that shows its data.
 */
function createSelfDrawnFamilies() {
  let counter = 0;
  const nextId = (name) => `resizeWithoutCamera-${name}-${counter++}`;
  const ecgImageId = 'ecg://resizeWithoutCamera/image-001';

  return [
    {
      name: 'a video viewport',
      setUp: () => addTestVideoMetadata(),
      make: async (renderingEngine, size) => {
        const viewportId = nextId('video');

        testUtils.createViewports(renderingEngine, {
          width: size[0],
          height: size[1],
          useEnableElement: true,
          orientation: null,
          viewportId,
          viewportType: ViewportType.VIDEO,
        });

        const viewport = renderingEngine.getViewport(viewportId);
        const element = () => viewport.element.querySelector('video');

        await viewport.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
        await waitFor(
          () => element().readyState >= 2 && !element().seeking,
          20000
        );
        await frames(3);

        return viewport;
      },
    },
    {
      name: 'an ECG viewport',
      setUp: () => addEcgMetadata(ecgImageId),
      make: async (renderingEngine, size) => {
        const viewportId = nextId('ecg');

        testUtils.createViewports(renderingEngine, {
          width: size[0],
          height: size[1],
          useEnableElement: true,
          viewportId,
          viewportType: ViewportType.ECG,
        });

        const viewport = renderingEngine.getViewport(viewportId);

        await viewport.setDisplaySets({ displaySetId: ecgImageId });
        viewport.render();
        await frames(3);

        return viewport;
      },
    },
  ];
}

describe('The views that renderingEngine.resize() does not keep the camera of -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  /** Makes a planar viewport of a size at image 3 of a series, in stack mode. */
  async function makePlanar(series, viewportId, size) {
    testUtils.createViewports(renderingEngine, {
      viewportId,
      viewportType: ViewportType.PLANAR,
      orientation: OrientationAxis.ACQUISITION,
      width: size[0],
      height: size[1],
      useEnableElement: true,
    });

    const viewport = renderingEngine.getViewport(viewportId);

    await showStack(viewport, series, 3);

    return viewport;
  }

  for (const { name, viewState } of PLANAR_VIEWS) {
    it(`fits a planar view with ${name} to the new size, as a viewport made at that size with the same view state, with keepCamera true`, async function () {
      const series = await createSeries({ id: 'resizeWithoutCamera' });
      const viewport = await makePlanar(series, 'withoutCameraPlanar', LARGE);
      const twin = await makePlanar(series, 'withoutCameraPlanarTwin', TALL);

      viewport.setViewState(viewState);
      twin.setViewState(viewState);
      await renderAndWait(viewport);
      await renderAndWait(twin);

      const before = viewport.getResolvedView().toICamera().parallelScale;

      await resizeTo(renderingEngine, viewport, TALL, true);
      await renderAndWait(viewport);

      const after = viewport.getResolvedView().toICamera().parallelScale;

      expect(after).not.toBeCloseTo(before, 2);
      expect(after).toBeCloseTo(
        twin.getResolvedView().toICamera().parallelScale,
        4
      );
      expect(worldPerCanvasPixel(viewport)).toBeCloseTo(
        worldPerCanvasPixel(twin),
        4
      );
    }, 20000);
  }

  for (const family of createSelfDrawnFamilies()) {
    it(`keeps the zoom against the fit of ${family.name}, not its camera, through a resize to another shape with keepCamera true, as a framing written at that size`, async function () {
      family.setUp();

      const viewport = await family.make(renderingEngine, LARGE);
      const twin = await family.make(renderingEngine, TALL);

      viewport.setViewFraming({ zoom: 1.5, pan: [0, 0] });
      twin.setViewFraming({ zoom: 1.5, pan: [0, 0] });
      viewport.render();
      twin.render();
      await frames(3);

      const before = worldPerCanvasPixel(viewport);

      await resizeTo(renderingEngine, viewport, TALL, true);
      viewport.render();
      await frames(3);

      expect(viewport.getViewFraming().zoom).toBeCloseTo(1.5, 4);
      expect(worldPerCanvasPixel(viewport)).not.toBeCloseTo(before, 3);
      expect(worldPerCanvasPixel(viewport)).toBeCloseTo(
        worldPerCanvasPixel(twin),
        4
      );
    }, 30000);

    it(`fits ${family.name} to the new size with keepCamera false`, async function () {
      family.setUp();

      const viewport = await family.make(renderingEngine, LARGE);

      viewport.setViewFraming({ zoom: 1.5, pan: [30, 10] });
      viewport.render();
      await frames(3);
      await resizeTo(renderingEngine, viewport, TALL, false);
      viewport.render();
      await frames(3);

      const { zoom, pan } = viewport.getViewFraming();

      expect(zoom).toBeCloseTo(1, 4);
      expect(pan[0]).toBeCloseTo(0, 3);
      expect(pan[1]).toBeCloseTo(0, 3);
    }, 30000);
  }
});
