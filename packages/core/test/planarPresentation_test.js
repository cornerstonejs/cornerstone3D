import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  ctPresentation,
  petColorMapPresentation,
  petPresentation,
} from '../../../utils/demo/helpers/volumePresentationRecipes';
import perfusionColorMap from '../../tools/examples/rectangleROIThreshold/preset';
import { readStoredPicture } from './utils/storedPicture';
import { SAMPLED_SLICE_REST_DELAY_MS } from '../src/RenderingEngine/Viewports/Planar/planarSampledSliceRest';
import * as legacySigmoidPicture from './groundTruth/planarPresentation_legacy_sigmoid.png';
import * as adapterCtCallbackPicture from './groundTruth/planarPresentation_adapter_callback_ct.png';
import * as adapterPetCallbackPicture from './groundTruth/planarPresentation_adapter_callback_pet.png';
import * as adapterPetColorMapCallbackPicture from './groundTruth/planarPresentation_adapter_callback_petColorMap.png';
import * as adapterPetColorMapPresetCallbackPicture from './groundTruth/planarPresentation_adapter_callback_petColorMapPreset.png';

const { Enums, volumeLoader, utilities, cache, eventTarget } = cornerstone3D;
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
 * Makes the direct next planar viewports of `nextIds`, all axial and of one
 * size, in one rendering engine.
 */
function createViewports(renderingEngine, nextIds) {
  const options = {
    orientation: OrientationAxis.AXIAL,
    width: SIZE,
    height: SIZE,
    background: [0, 0, 0],
    useEnableElement: true,
  };

  nextIds.forEach((viewportId) =>
    testUtils.createViewports(renderingEngine, {
      ...options,
      viewportId,
      viewportType: ViewportType.PLANAR,
    })
  );

  return nextIds.map((id) => renderingEngine.getViewport(id));
}

/** Shows the volume on a direct next planar viewport through a display set. */
async function showVolumeOnNext(viewport, volumeId, options = {}) {
  const displaySetId = `presentation:${viewport.id}:${volumeId}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
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

/**
 * Waits for the draw of the CPU path at rest, which samples the slice once
 * more on the screen grid, and for the frames of the rendering engine.
 */
async function waitForDraws() {
  await new Promise((resolve) =>
    setTimeout(resolve, 3 * SAMPLED_SLICE_REST_DELAY_MS)
  );

  for (let frame = 0; frame < 3; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
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

/**
 * The picture that the legacy volume viewport drew of the ramp volume with
 * the window of the tests and the sampled sigmoid VOI LUT function.
 */
const LEGACY_SIGMOID_PICTURE = legacySigmoidPicture.default;

describe('Planar presentation, a sigmoid window on a volume -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = setupEngine();
  });

  afterEach(function () {
    cleanupEngine();
  });

  it('draws the sigmoid as the legacy volume viewport on every next draw path', async function () {
    const nexts = createViewports(
      renderingEngine,
      NEXT_PATHS.map(({ viewportId }) => viewportId)
    );
    const volumeId = await createRampVolume();
    const legacyPicture = await readStoredPicture(LEGACY_SIGMOID_PICTURE);
    const rows = [];

    for (let index = 0; index < nexts.length; index++) {
      const next = nexts[index];
      const path = NEXT_PATHS[index];
      const displaySetId = await showVolumeOnNext(next, volumeId, path.options);

      next.setDisplaySetAppearance(displaySetId, { voiRange: VOI_RANGE });
      await renderAndWait(next);

      const linearDifference = getLargestDifference(
        legacyPicture,
        readPixels(next)
      );

      next.setDisplaySetAppearance(displaySetId, {
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
 * Collects the colormaps that DISPLAY_SET_APPEARANCE_CHANGED carries on the
 * element of a viewport when the colormap changes.
 */
function collectColormapEvents(viewport) {
  const colormaps = [];

  viewport.element.addEventListener(
    Events.DISPLAY_SET_APPEARANCE_CHANGED,
    (event) => {
      if (event.detail.changedKeys.includes('colormap')) {
        colormaps.push(event.detail.overrides.colormap);
      }
    }
  );

  return colormaps;
}

/**
 * The colormap of the last COLORMAP_MODIFIED event of the legacy volume
 * viewport after `setProperties` with the colormap name `hsv` and then with
 * the colormap opacity 0.5 alone.
 */
const LEGACY_LAST_COLORMAP = { name: 'hsv', opacity: 0.5 };

describe('Planar presentation, a colormap update keeps what it does not name -- ', () => {
  let renderingEngine;
  let stepwise;
  let atOnce;
  let volumeId;
  let stepwiseId;
  let atOnceId;

  beforeEach(async function () {
    renderingEngine = setupEngine();
    [stepwise, atOnce] = createViewports(renderingEngine, [
      'stepwise',
      'atOnce',
    ]);
    volumeId = await createRampVolume();
    stepwiseId = await showVolumeOnNext(stepwise, volumeId);
    atOnceId = await showVolumeOnNext(atOnce, volumeId);
    stepwise.setDisplaySetAppearance(stepwiseId, { voiRange: VOI_RANGE });
    atOnce.setDisplaySetAppearance(atOnceId, { voiRange: VOI_RANGE });
  });

  afterEach(function () {
    cleanupEngine();
  });

  it('keeps the name when only the opacity changes, and sends the whole colormap', async function () {
    const nextEvents = collectColormapEvents(stepwise);

    stepwise.setDisplaySetAppearance(stepwiseId, {
      colormap: { name: 'hsv' },
    });
    stepwise.setDisplaySetAppearance(stepwiseId, {
      colormap: { opacity: 0.5 },
    });
    atOnce.setDisplaySetAppearance(atOnceId, {
      colormap: { name: 'hsv', opacity: 0.5 },
    });
    await renderAndWait(stepwise);
    await renderAndWait(atOnce);

    const difference = getLargestDifference(
      readPixels(stepwise),
      readPixels(atOnce)
    );
    const legacyLast = LEGACY_LAST_COLORMAP;
    const nextLast = nextEvents[nextEvents.length - 1];

    console.log(
      `[PLANAR_COLORMAP_OPACITY]${JSON.stringify({
        difference,
        legacy: { name: legacyLast?.name, opacity: legacyLast?.opacity },
        next: nextLast,
      })}`
    );
    expect(difference).toBeLessThanOrEqual(1);
    expect(stepwise.getDisplaySetAppearance(stepwiseId).colormap).toEqual({
      name: 'hsv',
      opacity: 0.5,
    });
    expect(nextLast.name).toBe(legacyLast.name);
    expect(nextLast.opacity).toBe(0.5);
  }, 60000);

  it('keeps the opacity and the threshold when only the name changes', async function () {
    stepwise.setDisplaySetAppearance(stepwiseId, {
      colormap: { name: 'hsv', opacity: 0.5, threshold: 100 },
    });
    stepwise.setDisplaySetAppearance(stepwiseId, {
      colormap: { name: 'Grayscale' },
    });
    atOnce.setDisplaySetAppearance(atOnceId, {
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
    expect(stepwise.getDisplaySetAppearance(stepwiseId).colormap).toEqual({
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
 * The points of the scalar opacity function that the legacy volume viewport
 * class of 5.x made for a colormap with `OPACITY_LIST` as its opacity: value
 * and opacity of each point. The values were read from that class before it
 * was deleted. A next planar viewport of 5.x and its legacy adapter measured
 * the list in the window: their points were 0, 0, 25.2 and 0.8.
 */
const LEGACY_OPACITY_LIST_POINTS = [0, 0, 0.1, 0.8];

/**
 * Every fourth red value of the middle row of the picture that the legacy
 * volume viewport class drew with that colormap on the ramp overlay.
 */
const LEGACY_OPACITY_LIST_MIDDLE_ROW = [
  0, 1, 1, 2, 3, 4, 5, 5, 6, 7, 8, 8, 9, 10, 11, 11, 12, 13, 14, 15, 15, 16, 17,
  18, 18, 19, 20, 21, 22, 22, 23, 24,
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

  it('reads a list of opacities in opacity as an opacityMapping, as the legacy volume viewport, on every next draw path', async function () {
    const sourceId = await createFlatVolume('opacityListSource', 0);
    const overlayId = await createRampVolume('opacityListOverlay');
    const overlayWindow = { lower: 0, upper: 252 };
    const opacityPointsOf = (viewport) =>
      Array.from(
        viewport
          .getActors()
          [viewport.getActors().length - 1].actor.getProperty()
          .getScalarOpacity(0)
          .getDataPointer()
      );
    const rows = [];

    for (const path of NEXT_PATHS) {
      const viewports = createViewports(renderingEngine, [
        `${path.viewportId}List`,
        `${path.viewportId}Mapping`,
      ]);
      const colormaps = [
        {
          name: 'Grayscale',
          opacity: OPACITY_LIST.map((point) => ({ ...point })),
        },
        {
          name: 'Grayscale',
          opacityMapping: OPACITY_LIST.map((point) => ({ ...point })),
        },
      ];

      for (const [index, viewport] of viewports.entries()) {
        const sourceDisplaySetId = await showVolumeOnNext(
          viewport,
          sourceId,
          path.options
        );
        const overlayDisplaySetId = `presentation:${viewport.id}:${overlayId}`;

        cornerstone3D.displaySetRegistry.add(overlayDisplaySetId, {
          imageIds: cache.getVolume(overlayId).imageIds,
          volumeId: overlayId,
        });
        await viewport.addDisplaySet(overlayDisplaySetId, path.options);
        viewport.setDisplaySetAppearance(sourceDisplaySetId, {
          voiRange: { lower: 0, upper: 252 },
        });
        viewport.setDisplaySetAppearance(overlayDisplaySetId, {
          voiRange: overlayWindow,
          colormap: colormaps[index],
        });
        await renderAndWait(viewport);
      }

      await waitForDraws();

      const [listed, mapped] = viewports;
      const drawsWithVtk = path.renderMode.startsWith('vtk');

      rows.push({
        path: path.viewportId,
        renderMode: listed.getRenderPlan()[0].renderMode,
        listed: middleRow(readPixels(listed)).filter((_, x) => x % 4 === 0),
        listedPoints: drawsWithVtk ? opacityPointsOf(listed) : null,
        mappedPoints: drawsWithVtk ? opacityPointsOf(mapped) : null,
        largestToMapping: getLargestDifference(
          readPixels(listed),
          readPixels(mapped)
        ),
      });
    }

    console.log(
      `[PLANAR_OPACITY_LIST]${JSON.stringify({
        legacy: LEGACY_OPACITY_LIST_MIDDLE_ROW,
        legacyPoints: LEGACY_OPACITY_LIST_POINTS,
        rows,
      })}`
    );

    rows.forEach((row, index) => {
      expect(row.renderMode).toBe(NEXT_PATHS[index].renderMode);

      if (row.listedPoints) {
        expect(row.listedPoints).toEqual(LEGACY_OPACITY_LIST_POINTS);
        expect(row.mappedPoints).toEqual(LEGACY_OPACITY_LIST_POINTS);
      }

      expect(row.largestToMapping).toBe(0);
    });
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
 * opacities weaker, as the legacy thin slab does. `adapterPicture` is the
 * picture that a planar legacy adapter drew for `setVolumes` with the
 * callback, and `adapterColormapName` the colormap name that it then gave
 * in `getProperties`. For the last case the callback had the perfusion
 * preset.
 */
const CALLBACK_CASES = [
  {
    name: 'setCtTransferFunctionForVolumeActor',
    adapterPicture: adapterCtCallbackPicture.default,
    adapterColormapName: 'Grayscale',
    presentation: () => ctPresentation(),
    volume: 'ramp',
    columns: [[4, SIZE - 4]],
  },
  {
    name: 'setPetTransferFunctionForVolumeActor',
    adapterPicture: adapterPetCallbackPicture.default,
    adapterColormapName: 'Inverted-Grayscale',
    presentation: () => petPresentation(),
    volume: 'suv',
    columns: [[4, SIZE - 4]],
  },
  {
    name: 'setPetColorMapTransferFunctionForVolumeActor',
    adapterPicture: adapterPetColorMapCallbackPicture.default,
    adapterColormapName: 'hsv',
    presentation: () => petColorMapPresentation(),
    volume: 'suv',
    columns: [
      [4, 12],
      [84, SIZE - 4],
    ],
  },
  {
    name: 'setPetColorMapTransferFunctionForVolumeActor with a preset',
    adapterPicture: adapterPetColorMapPresetCallbackPicture.default,
    adapterColormapName: 'perfusion',
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
      const [next] = createViewports(renderingEngine, ['next']);
      const volumeId =
        callbackCase.volume === 'ramp'
          ? await createRampVolume(`callbackRamp${index}`)
          : await createSuvStepVolume(`callbackSuv${index}`);

      const presentation = callbackCase.presentation();
      const displaySetId = await showVolumeOnNext(next, volumeId);

      next.setDisplaySetAppearance(displaySetId, presentation);
      await renderAndWait(next);

      const adapterPicture = await readStoredPicture(
        callbackCase.adapterPicture
      );
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
          adapterColormapName: callbackCase.adapterColormapName,
        })}`
      );
      differences.forEach((difference) => {
        expect(difference).toBeLessThanOrEqual(2);
      });
    }, 60000);
  });
});
