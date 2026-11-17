import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import setCtTransferFunctionForVolumeActor from '../../../utils/demo/helpers/setCtTransferFunctionForVolumeActor';
import setPetTransferFunctionForVolumeActor from '../../../utils/demo/helpers/setPetTransferFunctionForVolumeActor';
import setPetColorMapTransferFunctionForVolumeActor from '../../../utils/demo/helpers/setPetColorMapTransferFunctionForVolumeActor';
import {
  ctPresentation,
  petColorMapPresentation,
  petPresentation,
} from '../../../utils/demo/helpers/volumePresentationRecipes';
import perfusionColorMap from '../../tools/examples/rectangleROIThreshold/preset';

const { Enums, volumeLoader, utilities, getConfiguration, cache, eventTarget } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events, VOILUTFunctionType } = Enums;

const renderingEngineId = utilities.uuidv4();
const SIZE = 128;
const VOI_RANGE = { lower: 60, upper: 180 };

/**
 * The next draw paths of a volume slice and the options of the display set
 * that pick each: the slice cut on the CPU and drawn on the GPU (the
 * default), the volume texture on the GPU, and the 2D canvas.
 */
const NEXT_PATHS = [
  { viewportId: 'nextSampled', options: {}, renderMode: 'vtkSampledSlice' },
  {
    viewportId: 'nextVolume',
    options: { sliceFirst: false },
    renderMode: 'vtkVolumeSlice',
  },
  {
    viewportId: 'nextCpu',
    options: { renderBackend: 'cpu' },
    renderMode: 'cpuVolume',
  },
];

/**
 * Makes and caches a volume of 64 by 64 by 9 voxels of 1 mm whose values rise
 * from 0 to 252 along the columns, so that a window draws a ramp.
 */
async function createRampVolume(name = 'presentationRamp') {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURIExact',
    id: name,
    rows: 64,
    columns: 64,
    slices: 9,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: [],
  });
  const { voxelManager } = volume;

  for (let k = 0; k < 9; k++) {
    for (let j = 0; j < 64; j++) {
      for (let i = 0; i < 64; i++) {
        voxelManager.setAtIJK(i, j, k, i * 4);
      }
    }
  }

  volume.modified();

  return volumeId;
}

/**
 * Makes a legacy volume viewport and the direct next planar viewports of
 * `nextIds`, all axial and of one size, in one rendering engine.
 */
function createViewports(renderingEngine, nextIds) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;
  const options = {
    orientation: OrientationAxis.AXIAL,
    width: SIZE,
    height: SIZE,
    background: [0, 0, 0],
    useEnableElement: true,
  };

  rendering.useGenericViewport = false;
  testUtils.createViewports(renderingEngine, {
    ...options,
    viewportId: 'legacy',
    viewportType: ViewportType.ORTHOGRAPHIC,
  });
  rendering.useGenericViewport = useGenericViewport;
  nextIds.forEach((viewportId) =>
    testUtils.createViewports(renderingEngine, {
      ...options,
      viewportId,
      viewportType: ViewportType.PLANAR_NEXT,
    })
  );

  return ['legacy', ...nextIds].map((id) => renderingEngine.getViewport(id));
}

/** Shows the volume on a direct next planar viewport through a display set. */
async function showVolumeOnNext(viewport, volumeId, options = {}) {
  const displaySetId = `presentation:${viewport.id}:${volumeId}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.AXIAL, ...options },
  });

  return displaySetId;
}

/**
 * Renders the viewport and waits for its IMAGE_RENDERED event, or for half a
 * second when no event comes.
 */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    const finish = () => {
      viewport.element.removeEventListener(Events.IMAGE_RENDERED, finish);
      clearTimeout(timer);
      setTimeout(resolve, 30);
    };
    const timer = setTimeout(finish, 500);

    viewport.element.addEventListener(Events.IMAGE_RENDERED, finish);
    viewport.render();
  });
}

/** The pixels of the canvas of the viewport, as RGBA bytes. */
function readPixels(viewport) {
  const source = viewport.getCanvas();
  const canvas = document.createElement('canvas');

  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d').drawImage(source, 0, 0);

  return canvas
    .getContext('2d')
    .getImageData(0, 0, source.width, source.height);
}

/**
 * The largest difference of one colour value between two pictures, over the
 * pixels inside the middle of the canvas: the border of the slice may fall
 * one pixel apart on two draw paths.
 */
function getLargestDifference(first, second, margin = 4) {
  let largest = 0;
  const { width, height } = first;

  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) {
      const offset = (y * width + x) * 4;

      for (let channel = 0; channel < 3; channel++) {
        largest = Math.max(
          largest,
          Math.abs(first.data[offset + channel] - second.data[offset + channel])
        );
      }
    }
  }

  return largest;
}

/** The red values of the middle row of a picture. */
function middleRow(picture) {
  const row = Math.floor(picture.height / 2);

  return Array.from({ length: picture.width }, (_, x) => {
    return picture.data[(row * picture.width + x) * 4];
  });
}

function setupEngine() {
  return testUtils.setupTestEnvironment({
    renderingEngineId,
    toolGroupIds: ['default'],
  }).renderingEngine;
}

function cleanupEngine() {
  testUtils.cleanupTestEnvironment({
    renderingEngineId,
    toolGroupIds: ['default'],
  });
}

describe('Planar presentation, a sigmoid window on a volume -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = setupEngine();
  });

  afterEach(function () {
    cleanupEngine();
  });

  it('draws the sigmoid as the legacy volume viewport on every next draw path', async function () {
    const [legacy, ...nexts] = createViewports(
      renderingEngine,
      NEXT_PATHS.map(({ viewportId }) => viewportId)
    );
    const volumeId = await createRampVolume();

    await legacy.setVolumes([{ volumeId }]);
    legacy.setProperties({
      voiRange: VOI_RANGE,
      VOILUTFunction: VOILUTFunctionType.SAMPLED_SIGMOID,
    });
    legacy.setProperties({ voiRange: VOI_RANGE });
    await renderAndWait(legacy);

    const legacyPicture = readPixels(legacy);
    const rows = [];

    for (let index = 0; index < nexts.length; index++) {
      const next = nexts[index];
      const path = NEXT_PATHS[index];
      const displaySetId = await showVolumeOnNext(next, volumeId, path.options);

      next.setDisplaySetPresentation(displaySetId, { voiRange: VOI_RANGE });
      await renderAndWait(next);

      const linearDifference = getLargestDifference(
        legacyPicture,
        readPixels(next)
      );

      next.setDisplaySetPresentation(displaySetId, {
        voiLUTFunction: VOILUTFunctionType.SAMPLED_SIGMOID,
      });
      await renderAndWait(next);

      const picture = readPixels(next);

      rows.push({
        path: path.viewportId,
        renderMode: next.getRenderPlan()[0].renderMode,
        linearDifference,
        sigmoidDifference: getLargestDifference(legacyPicture, picture),
        next: middleRow(picture).filter((_, x) => x % 8 === 0),
      });
    }

    console.log(
      `[PLANAR_SIGMOID]${JSON.stringify({
        legacy: middleRow(legacyPicture).filter((_, x) => x % 8 === 0),
        rows,
      })}`
    );

    rows.forEach((row, index) => {
      expect(row.renderMode).toBe(NEXT_PATHS[index].renderMode);
      expect(row.linearDifference).toBeGreaterThan(8);
      expect(row.sigmoidDifference).toBeLessThanOrEqual(3);
    });
  }, 60000);
});

/**
 * Collects the colormaps that COLORMAP_MODIFIED carries on the element of a
 * viewport.
 */
function collectColormapEvents(viewport) {
  const colormaps = [];

  viewport.element.addEventListener(Events.COLORMAP_MODIFIED, (event) => {
    colormaps.push(event.detail.colormap);
  });

  return colormaps;
}

describe('Planar presentation, a colormap update keeps what it does not name -- ', () => {
  let renderingEngine;
  let legacy;
  let stepwise;
  let atOnce;
  let volumeId;
  let stepwiseId;
  let atOnceId;

  beforeEach(async function () {
    renderingEngine = setupEngine();
    [legacy, stepwise, atOnce] = createViewports(renderingEngine, [
      'stepwise',
      'atOnce',
    ]);
    volumeId = await createRampVolume();
    await legacy.setVolumes([{ volumeId }]);
    legacy.setProperties({ voiRange: VOI_RANGE });
    stepwiseId = await showVolumeOnNext(stepwise, volumeId);
    atOnceId = await showVolumeOnNext(atOnce, volumeId);
    stepwise.setDisplaySetPresentation(stepwiseId, { voiRange: VOI_RANGE });
    atOnce.setDisplaySetPresentation(atOnceId, { voiRange: VOI_RANGE });
  });

  afterEach(function () {
    cleanupEngine();
  });

  it('keeps the name when only the opacity changes, and sends the whole colormap', async function () {
    const legacyEvents = collectColormapEvents(legacy);
    const nextEvents = collectColormapEvents(stepwise);

    legacy.setProperties({ colormap: { name: 'hsv' } });
    legacy.setProperties({ colormap: { opacity: 0.5 } });
    stepwise.setDisplaySetPresentation(stepwiseId, {
      colormap: { name: 'hsv' },
    });
    stepwise.setDisplaySetPresentation(stepwiseId, {
      colormap: { opacity: 0.5 },
    });
    atOnce.setDisplaySetPresentation(atOnceId, {
      colormap: { name: 'hsv', opacity: 0.5 },
    });
    await renderAndWait(stepwise);
    await renderAndWait(atOnce);

    const difference = getLargestDifference(
      readPixels(stepwise),
      readPixels(atOnce)
    );
    const legacyLast = legacyEvents[legacyEvents.length - 1];
    const nextLast = nextEvents[nextEvents.length - 1];

    console.log(
      `[PLANAR_COLORMAP_OPACITY]${JSON.stringify({
        difference,
        legacy: { name: legacyLast?.name, opacity: legacyLast?.opacity },
        next: nextLast,
      })}`
    );
    expect(difference).toBeLessThanOrEqual(1);
    expect(stepwise.getDisplaySetPresentation(stepwiseId).colormap).toEqual({
      name: 'hsv',
      opacity: 0.5,
    });
    expect(legacyLast.name).toBe('hsv');
    expect(nextLast.name).toBe(legacyLast.name);
    expect(nextLast.opacity).toBe(0.5);
  }, 60000);

  it('keeps the opacity and the threshold when only the name changes', async function () {
    stepwise.setDisplaySetPresentation(stepwiseId, {
      colormap: { name: 'hsv', opacity: 0.5, threshold: 100 },
    });
    stepwise.setDisplaySetPresentation(stepwiseId, {
      colormap: { name: 'Grayscale' },
    });
    atOnce.setDisplaySetPresentation(atOnceId, {
      colormap: { name: 'Grayscale', opacity: 0.5, threshold: 100 },
    });
    await renderAndWait(stepwise);
    await renderAndWait(atOnce);

    const difference = getLargestDifference(
      readPixels(stepwise),
      readPixels(atOnce)
    );

    console.log(`[PLANAR_COLORMAP_NAME]${JSON.stringify({ difference })}`);
    expect(difference).toBeLessThanOrEqual(1);
    expect(stepwise.getDisplaySetPresentation(stepwiseId).colormap).toEqual({
      name: 'Grayscale',
      opacity: 0.5,
      threshold: 100,
    });
  }, 60000);
});

const OPACITY_LIST = [
  { value: 0, opacity: 0 },
  { value: 0.1, opacity: 0.8 },
];

/**
 * Makes and caches a volume of 64 by 64 by 9 voxels of 1 mm that holds one
 * value everywhere.
 */
async function createFlatVolume(name, value) {
  const volumeId = await createRampVolume(name);
  const { voxelManager } = cache.getVolume(volumeId);

  for (let k = 0; k < 9; k++) {
    for (let j = 0; j < 64; j++) {
      for (let i = 0; i < 64; i++) {
        voxelManager.setAtIJK(i, j, k, value);
      }
    }
  }

  cache.getVolume(volumeId).modified();

  return volumeId;
}

describe('Planar presentation, a list of opacities in a colormap -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = setupEngine();
  });

  afterEach(function () {
    cleanupEngine();
  });

  it('reads an opacityMapping as the legacy volume viewport reads a list of opacities, and measures a list in opacity', async function () {
    const [legacy, next, mapped] = createViewports(renderingEngine, [
      'next',
      'mapped',
    ]);
    const sourceId = await createFlatVolume('opacityListSource', 0);
    const overlayId = await createRampVolume('opacityListOverlay');
    const overlayColormap = () => ({
      name: 'Grayscale',
      opacity: OPACITY_LIST.map((point) => ({ ...point })),
    });
    const overlayWindow = { lower: 0, upper: 252 };

    await legacy.setVolumes([{ volumeId: sourceId }, { volumeId: overlayId }]);
    legacy.setProperties({ voiRange: { lower: 0, upper: 252 } }, sourceId);
    legacy.setProperties(
      { colormap: overlayColormap(), voiRange: overlayWindow },
      overlayId
    );

    for (const [viewport, colormap] of [
      [next, overlayColormap()],
      [mapped, { name: 'Grayscale', opacityMapping: OPACITY_LIST }],
    ]) {
      const sourceDataId = await showVolumeOnNext(viewport, sourceId);
      const overlayDataId = `presentation:${viewport.id}:${overlayId}`;

      utilities.genericViewportDisplaySetMetadataProvider.add(overlayDataId, {
        imageIds: cache.getVolume(overlayId).imageIds,
        volumeId: overlayId,
      });
      await viewport.addDisplaySet(overlayDataId);
      viewport.setDisplaySetPresentation(sourceDataId, {
        voiRange: { lower: 0, upper: 252 },
      });
      viewport.setDisplaySetPresentation(overlayDataId, {
        voiRange: overlayWindow,
        colormap,
      });
    }

    for (const viewport of [legacy, next, mapped]) {
      await renderAndWait(viewport);
    }

    const opacityPointsOf = (viewport) =>
      Array.from(
        viewport
          .getActors()
          [viewport.getActors().length - 1].actor.getProperty()
          .getScalarOpacity(0)
          .getDataPointer()
      );
    const largestToMapping = getLargestDifference(
      readPixels(next),
      readPixels(mapped)
    );

    console.log(
      `[PLANAR_OPACITY_LIST]${JSON.stringify({
        legacy: middleRow(readPixels(legacy)).filter((_, x) => x % 4 === 0),
        next: middleRow(readPixels(next)).filter((_, x) => x % 4 === 0),
        mapped: middleRow(readPixels(mapped)).filter((_, x) => x % 4 === 0),
        legacyPoints: opacityPointsOf(legacy),
        nextPoints: opacityPointsOf(next),
        mappedPoints: opacityPointsOf(mapped),
        largestToMapping,
      })}`
    );
    expect(opacityPointsOf(mapped)).toEqual(opacityPointsOf(legacy));
    expect(largestToMapping).toBeGreaterThan(1);
  }, 60000);
});

/**
 * Makes and caches a volume of 64 by 64 by 9 voxels of 1 mm whose values
 * step from 0 to 7 along the columns, eight columns for each value, as SUV.
 */
async function createSuvStepVolume(name) {
  const volumeId = await createRampVolume(name);
  const volume = cache.getVolume(volumeId);

  for (let k = 0; k < 9; k++) {
    for (let j = 0; j < 64; j++) {
      for (let i = 0; i < 64; i++) {
        volume.voxelManager.setAtIJK(i, j, k, Math.floor(i / 8));
      }
    }
  }

  volume.modified();

  return volumeId;
}

/**
 * Makes a planar legacy adapter of an orthographic viewport and a direct
 * next planar viewport, both axial and of one size.
 */
function createAdapterAndNext(renderingEngine) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;
  const options = {
    orientation: OrientationAxis.AXIAL,
    width: SIZE,
    height: SIZE,
    background: [0, 0, 0],
    useEnableElement: true,
  };

  rendering.useGenericViewport = true;
  testUtils.createViewports(renderingEngine, {
    ...options,
    viewportId: 'adapter',
    viewportType: ViewportType.ORTHOGRAPHIC,
  });
  rendering.useGenericViewport = useGenericViewport;
  testUtils.createViewports(renderingEngine, {
    ...options,
    viewportId: 'next',
    viewportType: ViewportType.PLANAR_NEXT,
  });

  return ['adapter', 'next'].map((id) => renderingEngine.getViewport(id));
}

/**
 * The largest difference of one colour value between two pictures over the
 * columns from `from` to `to` (not included), away from the top and bottom.
 */
function getLargestDifferenceInColumns(first, second, from, to) {
  let largest = 0;

  for (let y = 4; y < first.height - 4; y++) {
    for (let x = from; x < to; x++) {
      const offset = (y * first.width + x) * 4;

      for (let channel = 0; channel < 3; channel++) {
        largest = Math.max(
          largest,
          Math.abs(first.data[offset + channel] - second.data[offset + channel])
        );
      }
    }
  }

  return largest;
}

/**
 * The callbacks that the examples give `setVolumes`, each with the recipe
 * that draws the same on a direct next viewport, the volume it is tried on,
 * and the columns where the pictures must agree: all of them, or for a
 * callback that writes an opacity function only the columns of SUV 0 and of
 * SUV 5 and more, where the opacity is 0 or 1. The adapter draws the other
 * opacities weaker, as the legacy thin slab does. The recipe is made before
 * the adapter runs the callback, so that a colormap of the recipe is
 * registered and the adapter can name it when it reads the callback back.
 */
const CALLBACK_CASES = [
  {
    name: 'setCtTransferFunctionForVolumeActor',
    callback: setCtTransferFunctionForVolumeActor,
    presentation: () => ctPresentation(),
    volume: 'ramp',
    columns: [[4, SIZE - 4]],
  },
  {
    name: 'setPetTransferFunctionForVolumeActor',
    callback: setPetTransferFunctionForVolumeActor,
    presentation: () => petPresentation(),
    volume: 'suv',
    columns: [[4, SIZE - 4]],
  },
  {
    name: 'setPetColorMapTransferFunctionForVolumeActor',
    callback: setPetColorMapTransferFunctionForVolumeActor,
    presentation: () => petColorMapPresentation(),
    volume: 'suv',
    columns: [
      [4, 12],
      [84, SIZE - 4],
    ],
  },
  {
    name: 'setPetColorMapTransferFunctionForVolumeActor with a preset',
    callback: ({ volumeActor }) =>
      setPetColorMapTransferFunctionForVolumeActor({
        volumeActor,
        preset: perfusionColorMap,
      }),
    presentation: () => petColorMapPresentation(perfusionColorMap),
    volume: 'suv',
    columns: [
      [4, 12],
      [84, SIZE - 4],
    ],
  },
];

describe('Planar presentation, the callbacks of the examples as presentations -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = setupEngine();
  });

  afterEach(function () {
    cleanupEngine();
  });

  CALLBACK_CASES.forEach((callbackCase, index) => {
    it(`draws the recipe of ${callbackCase.name} as the adapter draws the callback`, async function () {
      const [adapter, next] = createAdapterAndNext(renderingEngine);
      const volumeId =
        callbackCase.volume === 'ramp'
          ? await createRampVolume(`callbackRamp${index}`)
          : await createSuvStepVolume(`callbackSuv${index}`);

      const presentation = callbackCase.presentation();

      await adapter.setVolumes([{ volumeId, callback: callbackCase.callback }]);

      const displaySetId = await showVolumeOnNext(next, volumeId);

      next.setDisplaySetPresentation(displaySetId, presentation);
      await renderAndWait(adapter);
      await renderAndWait(next);

      const adapterPicture = readPixels(adapter);
      const nextPicture = readPixels(next);
      const differences = callbackCase.columns.map(([from, to]) =>
        getLargestDifferenceInColumns(adapterPicture, nextPicture, from, to)
      );

      console.log(
        `[PLANAR_CALLBACK]${JSON.stringify({
          name: callbackCase.name,
          differences,
          everywhere: getLargestDifference(adapterPicture, nextPicture),
          adapter: middleRow(adapterPicture).filter((_, x) => x % 8 === 0),
          next: middleRow(nextPicture).filter((_, x) => x % 8 === 0),
          adapterColormapName: adapter.getProperties().colormap?.name,
        })}`
      );
      differences.forEach((difference) => {
        expect(difference).toBeLessThanOrEqual(2);
      });
    }, 60000);
  });
});
