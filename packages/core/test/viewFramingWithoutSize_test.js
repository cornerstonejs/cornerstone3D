import * as cornerstone3D from '../src/index';
import ContextPoolRenderingEngine from '../src/RenderingEngine/ContextPoolRenderingEngine';
import TiledRenderingEngine from '../src/RenderingEngine/TiledRenderingEngine';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TEST_VIDEO,
  addTestVideoMetadata,
  animationFrames,
  waitFor,
} from '../../../utils/test/testUtilsVideo';
import {
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, volumeLoader, utilities, cache, metaData } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const environmentEngineId = utilities.uuidv4();

/** The framing of the smallest case of the OHIF upgrade (its M59). */
const FRAMING = { pan: [40, 20], zoom: 1.5 };

const ENGINES = [
  { name: 'the context pool engine', Engine: ContextPoolRenderingEngine },
  { name: 'the tiled engine', Engine: TiledRenderingEngine },
];

/**
 * The three ways an element has no size. Each hides the element and gives
 * the function that shows it again as it was.
 */
const HIDES = [
  {
    name: 'hidden with display none',
    hide: (element) => {
      element.style.display = 'none';

      return () => {
        element.style.display = '';
      };
    },
  },
  {
    name: 'detached from the document',
    hide: (element) => {
      const parent = element.parentNode;
      const next = element.nextSibling;

      element.remove();

      return () => {
        parent.insertBefore(element, next);
      };
    },
  },
  {
    name: 'of zero width',
    hide: (element) => {
      const { width } = element.style;

      element.style.width = '0px';

      return () => {
        element.style.width = width;
      };
    },
  },
];

/** Waits for the given number of animation frames. */
async function frames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * Makes and caches a volume of the fake volume loader: 40 columns, 30 rows
 * and 12 slices 2 mm apart.
 */
async function createVolume(name) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name,
    id: name,
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 2,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/** Makes a 3D viewport of the given size that shows a volume, and draws it. */
async function show3D(renderingEngine, viewportId, volumeId, size) {
  const element = document.createElement('div');
  const displaySetId = `framingWithoutSize3D:${viewportId}`;

  element.style.width = `${size[0]}px`;
  element.style.height = `${size[1]}px`;
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: { orientation: OrientationAxis.CORONAL },
  });

  const viewport = renderingEngine.getViewport(viewportId);

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({ displaySetId });
  viewport.render();
  await frames(3);

  return viewport;
}

/** Makes a planar viewport of the given size that shows the series. */
async function showPlanar(renderingEngine, viewportId, show, series, size) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.ACQUISITION,
    width: size[0],
    height: size[1],
    useEnableElement: true,
  });

  const viewport = renderingEngine.getViewport(viewportId);

  await show(viewport, series, 3);

  return viewport;
}

const pixelReader = document.createElement('canvas');

/** The RGBA bytes of what a canvas shows. */
function readPixels(canvas) {
  const context = pixelReader.getContext('2d', { willReadFrequently: true });

  pixelReader.width = canvas.width;
  pixelReader.height = canvas.height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(canvas, 0, 0);

  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** The number of pixels of two pictures that differ in any channel. */
function countChangedPixels(actual, expected) {
  expect(actual.length).toBe(expected.length);

  let changed = 0;

  for (let index = 0; index < actual.length; index += 4) {
    if (
      actual[index] !== expected[index] ||
      actual[index + 1] !== expected[index + 1] ||
      actual[index + 2] !== expected[index + 2] ||
      actual[index + 3] !== expected[index + 3]
    ) {
      changed++;
    }
  }

  return changed;
}

/** Gives the element of each viewport a size and resizes the engine. */
async function resizeTo(renderingEngine, viewports, size) {
  for (const viewport of viewports) {
    viewport.element.style.width = `${size[0]}px`;
    viewport.element.style.height = `${size[1]}px`;
  }

  renderingEngine.resize(true, true);
  await frames(3);
}

function expectPointClose(actual, expected, context, precision = 3) {
  expect(actual).withContext(context).toBeDefined();
  expected.forEach((value, axis) => {
    expect(actual[axis]).withContext(context).toBeCloseTo(value, precision);
  });
}

/**
 * The checks of one family: how to make a viewport of a size that shows
 * something, how to draw it and read its picture.
 */
const FAMILIES = [
  {
    name: 'a 3D viewport',
    setup: async (renderingEngine, name) => ({
      volumeId: await createVolume(name),
    }),
    make: (renderingEngine, viewportId, data, size) =>
      show3D(renderingEngine, viewportId, data.volumeId, size),
    picture: async (viewport) => {
      viewport.render();
      await frames(3);

      return readPixels(viewport.canvas);
    },
  },
  ...[
    ['stack mode', showStack],
    ['volume mode', showVolume],
    [
      'stack mode on the CPU',
      (viewport, series, sliceIndex) =>
        showStack(viewport, series, sliceIndex, { renderBackend: 'cpu' }),
    ],
  ].map(([mode, show]) => ({
    name: `a planar viewport in ${mode}`,
    setup: async (renderingEngine, name) => ({
      series: await createSeries({ id: name }),
    }),
    make: (renderingEngine, viewportId, data, size) =>
      showPlanar(renderingEngine, viewportId, show, data.series, size),
    picture: async (viewport) => {
      await renderAndWait(viewport);

      return readPixels(viewport.getCanvas());
    },
  })),
];

describe('The framing of a viewport whose element has no size -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    testUtils.setupTestEnvironment({
      renderingEngineId: environmentEngineId,
      toolGroupIds: [],
    });
  });

  afterEach(function () {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId: environmentEngineId,
    });
  });

  for (const family of FAMILIES) {
    for (const { name: engineName, Engine } of ENGINES) {
      for (const { name: hideName, hide } of HIDES) {
        it(`of ${family.name} on ${engineName}, ${hideName}, is the framing of the view, and restores its pan`, async function () {
          renderingEngine = new Engine(utilities.uuidv4());

          const data = await family.setup(renderingEngine, 'withoutSizeRead');
          const viewport = await family.make(
            renderingEngine,
            'withoutSizeRead',
            data,
            [400, 300]
          );

          viewport.setViewFraming(FRAMING);

          const visible = viewport.getViewFraming();
          const visibleZoom = viewport.getZoom();
          const visiblePan = viewport.getPan();
          const show = hide(viewport.element);
          const framing = viewport.getViewFraming();

          expectPointClose(framing.pan, FRAMING.pan, 'pan read without size');
          expect(framing.zoom).toBeCloseTo(FRAMING.zoom, 4);
          expect(viewport.getZoom()).toBeCloseTo(visibleZoom, 4);
          expectPointClose(viewport.getPan(), visiblePan, 'getPan');

          if (visible.scale?.mmPerCanvasPixel !== undefined) {
            expect(framing.scale.mmPerCanvasPixel).toBeCloseTo(
              visible.scale.mmPerCanvasPixel,
              6
            );
          }

          show();
          viewport.resetViewState();
          viewport.setViewFraming(framing);

          expectPointClose(
            viewport.getViewFraming().pan,
            FRAMING.pan,
            'pan restored'
          );
          expect(viewport.getViewFraming().zoom).toBeCloseTo(FRAMING.zoom, 4);
        }, 20000);

        it(`of ${family.name} on ${engineName}, ${hideName}, stays through a resize of the engine, and the view comes back as on a viewport that was not hidden`, async function () {
          renderingEngine = new Engine(utilities.uuidv4());

          const data = await family.setup(renderingEngine, 'withoutSizeResize');
          const viewport = await family.make(
            renderingEngine,
            'withoutSizeResize',
            data,
            [400, 300]
          );
          const twin = await family.make(
            renderingEngine,
            'withoutSizeResizeTwin',
            data,
            [400, 300]
          );

          viewport.setViewFraming(FRAMING);
          twin.setViewFraming(FRAMING);

          const show = hide(viewport.element);

          renderingEngine.resize(true, true);
          await frames(3);

          expectPointClose(
            viewport.getViewFraming().pan,
            FRAMING.pan,
            'pan after a resize without size'
          );
          expect(viewport.getViewFraming().zoom).toBeCloseTo(FRAMING.zoom, 4);

          show();
          renderingEngine.resize(true, true);
          await frames(3);

          expectPointClose(
            viewport.getViewFraming().pan,
            FRAMING.pan,
            'pan when shown again'
          );
          expect(viewport.getViewState()).toEqual(twin.getViewState());
          expect(
            countChangedPixels(
              await family.picture(viewport),
              await family.picture(twin)
            )
          ).toBe(0);
        }, 20000);

        it(`of ${family.name} on ${engineName}, ${hideName}, takes a framing, gives it back, and shows it when the element has its size again`, async function () {
          renderingEngine = new Engine(utilities.uuidv4());

          const data = await family.setup(renderingEngine, 'withoutSizeWrite');
          const viewport = await family.make(
            renderingEngine,
            'withoutSizeWrite',
            data,
            [400, 300]
          );
          const twin = await family.make(
            renderingEngine,
            'withoutSizeWriteTwin',
            data,
            [400, 300]
          );

          twin.setViewFraming(FRAMING);

          const show = hide(viewport.element);

          renderingEngine.resize(true, true);
          viewport.setViewFraming(FRAMING);

          expectPointClose(
            viewport.getViewFraming().pan,
            FRAMING.pan,
            'pan written without size'
          );
          expect(viewport.getViewFraming().zoom).toBeCloseTo(FRAMING.zoom, 4);

          show();
          renderingEngine.resize(true, true);
          await frames(3);

          expectPointClose(
            viewport.getViewFraming().pan,
            FRAMING.pan,
            'pan when shown'
          );
          expect(
            countChangedPixels(
              await family.picture(viewport),
              await family.picture(twin)
            )
          ).toBe(0);
        }, 20000);
      }

      it(`of ${family.name} on ${engineName}, hidden, takes a view state, gives it back, and shows it when the element has its size again`, async function () {
        renderingEngine = new Engine(utilities.uuidv4());

        const data = await family.setup(renderingEngine, 'withoutSizeState');
        const viewport = await family.make(
          renderingEngine,
          'withoutSizeState',
          data,
          [400, 300]
        );
        const twin = await family.make(
          renderingEngine,
          'withoutSizeStateTwin',
          data,
          [400, 300]
        );

        twin.setViewFraming(FRAMING);

        const viewState = twin.getViewState();

        viewport.element.style.display = 'none';
        renderingEngine.resize(true, true);
        viewport.setViewState(viewState);

        expect(viewport.getViewState()).toEqual(twin.getViewState());

        viewport.element.style.display = '';
        renderingEngine.resize(true, true);
        await frames(3);

        expectPointClose(
          viewport.getViewFraming().pan,
          FRAMING.pan,
          'pan when shown'
        );
        expect(
          countChangedPixels(
            await family.picture(viewport),
            await family.picture(twin)
          )
        ).toBe(0);
      }, 20000);

      it(`of ${family.name} on ${engineName}, written while hidden and shown at another size, is the framing restored on a viewport of that size`, async function () {
        renderingEngine = new Engine(utilities.uuidv4());

        const data = await family.setup(renderingEngine, 'withoutSizeOther');
        const viewport = await family.make(
          renderingEngine,
          'withoutSizeOther',
          data,
          [400, 300]
        );
        const twin = await family.make(
          renderingEngine,
          'withoutSizeOtherTwin',
          data,
          [250, 330]
        );

        twin.setViewFraming(FRAMING);
        viewport.element.style.display = 'none';
        viewport.setViewFraming(FRAMING);
        viewport.element.style.display = '';
        await resizeTo(renderingEngine, [viewport], [250, 330]);

        expectPointClose(
          viewport.getViewFraming().pan,
          FRAMING.pan,
          'pan at the other size'
        );
        expect(viewport.getViewFraming().zoom).toBeCloseTo(FRAMING.zoom, 4);
        expect(
          countChangedPixels(
            await family.picture(viewport),
            await family.picture(twin)
          )
        ).toBe(0);
      }, 20000);
    }
  }

  it('of a planar viewport on a screen of two device pixels per CSS pixel is the framing of the view', async function () {
    const descriptor = Object.getOwnPropertyDescriptor(
      window,
      'devicePixelRatio'
    );

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      get: () => 2,
    });

    try {
      renderingEngine = new ContextPoolRenderingEngine(utilities.uuidv4());

      const series = await createSeries({ id: 'withoutSizeDpr' });
      const viewport = await showPlanar(
        renderingEngine,
        'withoutSizeDpr',
        showStack,
        series,
        [400, 300]
      );

      viewport.setViewFraming(FRAMING);
      viewport.element.style.display = 'none';

      expectPointClose(
        viewport.getViewFraming().pan,
        FRAMING.pan,
        'pan read without size'
      );
      expect(viewport.getViewFraming().zoom).toBeCloseTo(FRAMING.zoom, 4);
    } finally {
      if (descriptor) {
        Object.defineProperty(window, 'devicePixelRatio', descriptor);
      } else {
        delete window.devicePixelRatio;
      }
    }
  }, 20000);
});

describe('A framing without a camera on a 3D viewport -- ', () => {
  let renderingEngine;
  let volumeId;

  beforeEach(async function () {
    testUtils.setupTestEnvironment({
      renderingEngineId: environmentEngineId,
      toolGroupIds: [],
    });
    renderingEngine = new ContextPoolRenderingEngine(utilities.uuidv4());
    volumeId = await createVolume('framingWithoutCamera');
  });

  afterEach(function () {
    renderingEngine?.destroy();
    renderingEngine = undefined;
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId: environmentEngineId,
    });
  });

  it('keeps the direction and applies the zoom and the pan of a framing that was read', async function () {
    const source = await show3D(
      renderingEngine,
      'withoutCameraSource',
      volumeId,
      [400, 300]
    );
    const target = await show3D(
      renderingEngine,
      'withoutCameraTarget',
      volumeId,
      [400, 300]
    );

    source.setViewFraming(FRAMING);

    const { camera: _camera, ...withoutCamera } = source.getViewFraming();
    const direction = target.getViewState();

    target.setViewFraming(withoutCamera);

    const framing = target.getViewFraming();

    expectPointClose(
      target.getViewState().viewPlaneNormal,
      direction.viewPlaneNormal,
      'view plane normal',
      6
    );
    expectPointClose(
      target.getViewState().viewUp,
      direction.viewUp,
      'view up',
      6
    );
    expect(framing.zoom).toBeCloseTo(FRAMING.zoom, 4);
    expectPointClose(framing.pan, FRAMING.pan, 'pan');
  }, 20000);

  it('applies only the keys of a partial framing, as on a planar viewport', async function () {
    const viewport = await show3D(
      renderingEngine,
      'withoutCameraPartial',
      volumeId,
      [400, 300]
    );
    const direction = viewport.getViewState();

    viewport.setViewFraming({ zoom: 2 });
    viewport.setViewFraming({ pan: [10, -5] });

    const framing = viewport.getViewFraming();

    expect(framing.zoom).toBeCloseTo(2, 4);
    expectPointClose(framing.pan, [10, -5], 'pan');
    expectPointClose(
      viewport.getViewState().viewPlaneNormal,
      direction.viewPlaneNormal,
      'view plane normal',
      6
    );
  }, 20000);
});

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

/** The families drawn by their own pipeline: video and ECG. */
const SELF_DRAWN = [
  {
    name: 'a video viewport',
    make: async (renderingEngine) => {
      addTestVideoMetadata();
      testUtils.createViewports(renderingEngine, {
        width: 320,
        height: 200,
        useEnableElement: true,
        orientation: null,
        viewportId: 'withoutSizeVideo',
        viewportType: ViewportType.VIDEO,
      });

      const viewport = renderingEngine.getViewport('withoutSizeVideo');
      const video = () => viewport.element.querySelector('video');

      await viewport.setDisplaySets({ displaySetId: TEST_VIDEO.imageId });
      await waitFor(() => video().readyState >= 2 && !video().seeking, 20000);
      await animationFrames(3);

      return viewport;
    },
  },
  {
    name: 'an ECG viewport',
    make: async (renderingEngine) => {
      const imageId = 'ecg://framingWithoutSize/image-001';

      addEcgMetadata(imageId);
      testUtils.createViewports(renderingEngine, {
        width: 400,
        height: 300,
        useEnableElement: true,
        viewportId: 'withoutSizeEcg',
        viewportType: ViewportType.ECG,
      });

      const viewport = renderingEngine.getViewport('withoutSizeEcg');

      await viewport.setDisplaySets({ displaySetId: imageId });
      viewport.render();
      await frames(3);

      return viewport;
    },
  },
];

describe('The framing of a self drawn viewport whose element has no size -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId: environmentEngineId,
      toolGroupIds: [],
    }).renderingEngine;
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId: environmentEngineId,
    });
  });

  for (const family of SELF_DRAWN) {
    for (const { name: hideName, hide } of HIDES) {
      it(`of ${family.name}, ${hideName}, is the framing of the view, takes one, and restores its pan`, async function () {
        const viewport = await family.make(renderingEngine);

        viewport.setViewFraming(FRAMING);

        const visible = viewport.getViewFraming();
        const visiblePan = viewport.getPan();
        const show = hide(viewport.element);
        const framing = viewport.getViewFraming();

        expectPointClose(framing.pan, visible.pan, 'pan read without size');
        expect(framing.zoom).toBeCloseTo(visible.zoom, 4);
        expectPointClose(viewport.getPan(), visiblePan, 'getPan');

        viewport.setViewFraming({ pan: [0, 0], zoom: 1 });
        viewport.setViewFraming(framing);

        expectPointClose(
          viewport.getViewFraming().pan,
          visible.pan,
          'pan written without size'
        );

        show();
        viewport.resetViewState();
        viewport.setViewFraming(framing);

        expectPointClose(
          viewport.getViewFraming().pan,
          visible.pan,
          'pan restored'
        );
        expect(viewport.getViewFraming().zoom).toBeCloseTo(visible.zoom, 4);
      }, 30000);
    }
  }
});
