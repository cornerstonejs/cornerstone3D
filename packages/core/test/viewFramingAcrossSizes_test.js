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
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, volumeLoader, utilities, cache, metaData } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The size of the pane of the start, as the large pane of OHIF's M67. */
const LARGE = [400, 300];

/** Half the size of the large pane, as the 3D pane of OHIF's 3D four up. */
const HALF = [200, 150];

/**
 * A pane of another shape, on which the fit of every test picture is limited
 * by the width where it was limited by the height on the large pane.
 */
const TALL = [250, 330];

/** The framing of the smallest case of the OHIF upgrade (its M59, M67). */
const FRAMING = { pan: [40, 20], zoom: 1.5 };

/**
 * The four ways a view goes to a pane of another size and back to a pane of
 * the first size, by a framing or by a resize each time.
 */
const SEQUENCES = [
  {
    name: 'a framing there and a framing back',
    there: 'framing',
    back: 'framing',
  },
  { name: 'a resize there and a resize back', there: 'resize', back: 'resize' },
  {
    name: 'a resize there and a framing back',
    there: 'resize',
    back: 'framing',
  },
  {
    name: 'a framing there and a resize back',
    there: 'framing',
    back: 'resize',
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

function expectPointClose(actual, expected, context, precision = 3) {
  expect(actual).withContext(context).toBeDefined();
  expected.forEach((value, axis) => {
    expect(actual[axis])
      .withContext(`${context} [${axis}]`)
      .toBeCloseTo(value, precision);
  });
}

/** The centre of the canvas of a viewport, in CSS pixels. */
function canvasCentre(viewport) {
  return [viewport.element.clientWidth / 2, viewport.element.clientHeight / 2];
}

/**
 * Turns the camera of a 3D viewport away from its orientation, about the
 * view up, so that a framing carries a direction of its own.
 */
function turn3D(viewport) {
  const { viewPlaneNormal, viewUp, focalPoint, position } =
    viewport.getViewState();
  const distance = Math.hypot(
    position[0] - focalPoint[0],
    position[1] - focalPoint[1],
    position[2] - focalPoint[2]
  );
  const right = [
    viewUp[1] * viewPlaneNormal[2] - viewUp[2] * viewPlaneNormal[1],
    viewUp[2] * viewPlaneNormal[0] - viewUp[0] * viewPlaneNormal[2],
    viewUp[0] * viewPlaneNormal[1] - viewUp[1] * viewPlaneNormal[0],
  ];
  const turned = viewPlaneNormal.map((value, axis) => value + right[axis]);
  const length = Math.hypot(...turned);
  const normal = turned.map((value) => value / length);

  viewport.setViewState({
    viewPlaneNormal: normal,
    viewUp,
    position: focalPoint.map((value, axis) => value + normal[axis] * distance),
  });
}

/**
 * The viewport families. Each makes a viewport of a size that shows its
 * data, draws it, reads its view, and reads its picture where a picture
 * can be drawn again pixel for pixel.
 */
function createFamilies() {
  let counter = 0;
  const nextId = (name) => `acrossSizes-${name}-${counter++}`;
  const planar = (mode, show) => {
    let series;

    return {
      name: `a planar viewport in ${mode} mode`,
      setUp: async () => {
        series = await createSeries({ id: `acrossSizes${mode}` });
      },
      make: async (renderingEngine, size) => {
        const viewportId = nextId(mode);

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
      },
      start: (viewport) => viewport.setViewFraming(FRAMING),
      draw: (viewport) => renderAndWait(viewport),
      centre: (viewport) => viewport.canvasToWorld(canvasCentre(viewport)),
      parallelScale: (viewport) =>
        viewport.getResolvedView().toICamera().parallelScale,
      picture: (viewport) => readPixels(viewport.getCanvas()),
    };
  };
  let volumeId;
  const volume3D = {
    name: 'a 3D viewport',
    setUp: async () => {
      volumeId = await createVolume('acrossSizes3D');
    },
    make: async (renderingEngine, size) => {
      const viewportId = nextId('3d');
      const element = document.createElement('div');
      const displaySetId = `acrossSizes3D:${viewportId}`;

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
    },
    start: (viewport) => {
      turn3D(viewport);
      viewport.setViewFraming(FRAMING);
    },
    draw: async (viewport) => {
      viewport.render();
      await frames(3);
    },
    centre: (viewport) => viewport.getViewState().focalPoint,
    parallelScale: (viewport) => viewport.getViewState().parallelScale,
  };
  const video = {
    name: 'a video viewport',
    setUp: async () => {
      addTestVideoMetadata();
    },
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
    start: (viewport) => viewport.setViewFraming(FRAMING),
    draw: async (viewport) => {
      viewport.render();
      await frames(3);
    },
    centre: (viewport) => viewport.canvasToWorld(canvasCentre(viewport)),
  };
  const ecgImageId = 'ecg://framingAcrossSizes/image-001';
  const ecg = {
    name: 'an ECG viewport',
    setUp: async () => {
      addEcgMetadata(ecgImageId);
    },
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
    start: (viewport) => viewport.setViewFraming(FRAMING),
    draw: async (viewport) => {
      viewport.render();
      await frames(3);
    },
  };

  return [
    volume3D,
    planar('stack', showStack),
    planar('volume', showVolume),
    video,
    ecg,
  ];
}

/** What a test compares of a view: its framing, its centre and its scale. */
function readView(family, viewport) {
  const { zoom, pan, worldPan } = viewport.getViewFraming();

  return {
    zoom,
    pan,
    worldPan,
    centre: family.centre?.(viewport),
    parallelScale: family.parallelScale?.(viewport),
  };
}

/** Expects two views to be the same view. */
function expectSameView(actual, expected, context) {
  expect(actual.zoom)
    .withContext(`${context}: zoom`)
    .toBeCloseTo(expected.zoom, 4);
  expectPointClose(actual.pan, expected.pan, `${context}: pan`);
  expectPointClose(actual.worldPan, expected.worldPan, `${context}: world pan`);

  if (expected.centre) {
    expectPointClose(actual.centre, expected.centre, `${context}: centre`);
  }

  if (expected.parallelScale !== undefined) {
    expect(actual.parallelScale)
      .withContext(`${context}: parallel scale`)
      .toBeCloseTo(expected.parallelScale, 4);
  }
}

/** Gives the element of a viewport a size and resizes the engine. */
async function resizeTo(renderingEngine, viewport, size) {
  viewport.element.style.width = `${size[0]}px`;
  viewport.element.style.height = `${size[1]}px`;
  renderingEngine.resize(true, true);
  await frames(3);
}

/**
 * Takes a view to a pane of a size: a resize of the pane that shows it, or
 * its framing written to a new viewport of that size, as OHIF stores the
 * framing of a pane when it unmounts and writes it after the next mount.
 */
async function carry(family, renderingEngine, viewport, how, size) {
  if (how === 'resize') {
    await resizeTo(renderingEngine, viewport, size);

    return viewport;
  }

  const framing = viewport.getViewFraming();
  const next = await family.make(renderingEngine, size);

  next.setViewFraming(framing);
  await family.draw(next);

  return next;
}

describe('A view framed on a pane of one size, carried to a pane of another size and back -- ', () => {
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

  for (const family of createFamilies()) {
    /** Makes the viewport of the start on the large pane, framed. */
    const startView = async () => {
      await family.setUp();

      const viewport = await family.make(renderingEngine, LARGE);

      family.start(viewport);
      await family.draw(viewport);

      return {
        viewport,
        view: readView(family, viewport),
        picture: family.picture?.(viewport),
      };
    };

    for (const sequence of SEQUENCES) {
      it(`of ${family.name}, by ${sequence.name} at half the size, comes back as it was (OHIF M67)`, async function () {
        const start = await startView();
        const there = await carry(
          family,
          renderingEngine,
          start.viewport,
          sequence.there,
          HALF
        );
        const back = await carry(
          family,
          renderingEngine,
          there,
          sequence.back,
          LARGE
        );

        expectSameView(readView(family, back), start.view, 'back');

        if (start.picture) {
          await family.draw(back);
          expect(countChangedPixels(family.picture(back), start.picture))
            .withContext('changed pixels')
            .toBe(0);
        }
      }, 60000);
    }

    it(`of ${family.name}, by its framing on a pane of half the size, shows the view that a resize to that size shows`, async function () {
      const start = await startView();
      const copied = await carry(
        family,
        renderingEngine,
        start.viewport,
        'framing',
        HALF
      );
      const copiedView = readView(family, copied);
      const copiedPicture = family.picture?.(copied);

      await resizeTo(renderingEngine, start.viewport, HALF);

      expectSameView(copiedView, readView(family, start.viewport), 'resized');
      expectPointClose(
        copiedView.pan,
        [FRAMING.pan[0] / 2, FRAMING.pan[1] / 2],
        'pan on half the size'
      );

      if (copiedPicture) {
        await family.draw(start.viewport);
        expect(
          countChangedPixels(family.picture(start.viewport), copiedPicture)
        )
          .withContext('changed pixels')
          .toBe(0);
      }
    }, 60000);

    if (!family.parallelScale) {
      continue;
    }

    it(`of ${family.name}, on a pane of another shape, keeps the world point at the centre by every way, and the zoom against the fit by a framing`, async function () {
      const start = await startView();
      const copied = await carry(
        family,
        renderingEngine,
        start.viewport,
        'framing',
        TALL
      );
      const copiedView = readView(family, copied);

      expect(copiedView.zoom).toBeCloseTo(start.view.zoom, 4);
      expectPointClose(copiedView.worldPan, start.view.worldPan, 'world pan');
      expectPointClose(copiedView.centre, start.view.centre, 'framing centre');

      await resizeTo(renderingEngine, start.viewport, TALL);

      const resized = readView(family, start.viewport);

      expect(resized.parallelScale).toBeCloseTo(start.view.parallelScale, 4);
      expect(resized.zoom).not.toBeCloseTo(start.view.zoom, 2);
      expectPointClose(
        resized.worldPan,
        start.view.worldPan,
        'resize world pan'
      );
      expectPointClose(resized.centre, start.view.centre, 'resize centre');

      const back = await carry(
        family,
        renderingEngine,
        start.viewport,
        'framing',
        LARGE
      );
      const backView = readView(family, back);

      expect(backView.zoom).toBeCloseTo(resized.zoom, 4);
      expectPointClose(backView.centre, start.view.centre, 'centre back');
    }, 60000);
  }
});
