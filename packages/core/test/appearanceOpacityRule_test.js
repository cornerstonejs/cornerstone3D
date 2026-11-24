import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { CPU_SLICE_REST_DELAY_MS } from '../src/RenderingEngine/Viewports/Planar/planarCpuSliceRest';
import {
  createSeries,
  drawPathOf,
  worldOfVoxel,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * The series of the tests: 64 columns in eight bands of eight columns, each
 * band one value (0, 32, ... 224) on every row and slice.
 */
const SIZE = {
  rows: 16,
  columns: 64,
  slices: 4,
  columnSpacing: 1,
  rowSpacing: 1,
  sliceSpacing: 1,
};
const BAND_WIDTH = 8;
const BAND_STEP = 32;
const BANDS = SIZE.columns / BAND_WIDTH;

/**
 * A window below every value of the data, so that every pixel of a grey
 * layer is white and its grey over the black background is 255 times its
 * alpha.
 */
const WHITE_WINDOW = { lower: -2, upper: -1 };

const OPACITY_MAPPING = [
  { value: 0, opacity: 0 },
  { value: 128, opacity: 1 },
  { value: 224, opacity: 0.5 },
];

/**
 * The appearances of the tests, each with the alpha of each band by the
 * rule, worked out by hand: `opacity * ramp(value)`, the ramp linear between
 * the points of the mapping, and 0 below the threshold. The threshold of 48
 * and of 100 falls between two bands, so the step of the opacity function
 * at the threshold is never sampled.
 */
const CASES = [
  {
    name: 'opacity, mapping and threshold',
    appearance: {
      opacity: 0.6,
      colormap: { opacityMapping: OPACITY_MAPPING, threshold: 48 },
    },
    alphas: [0, 0, 0.3, 0.45, 0.6, 0.5, 0.4, 0.3],
  },
  {
    name: 'opacity and threshold',
    appearance: { opacity: 0.6, colormap: { threshold: 100 } },
    alphas: [0, 0, 0, 0, 0.6, 0.6, 0.6, 0.6],
  },
  {
    name: 'mapping alone',
    appearance: { colormap: { opacityMapping: OPACITY_MAPPING } },
    alphas: [0, 0.25, 0.5, 0.75, 1, 5 / 6, 2 / 3, 0.5],
  },
  {
    name: 'opacity alone',
    appearance: { opacity: 0.4 },
    alphas: Array(BANDS).fill(0.4),
  },
];

/**
 * The largest difference, in grey levels of 0 to 255, that a path may draw
 * from `255 * alpha`. The opacity function is read from a texture of 8-bit
 * or float texels (or a table of the canvas rounded to 8 bits), linear
 * between texels, and the blend over the background is rounded to 8 bits
 * again: half a level for each rounding and one level for the texel of the
 * table. A band value sits on a straight piece of the ramp, so the linear
 * read between two texels adds nothing.
 */
const TOLERANCE = 2;

/**
 * The planar render paths: a stack of images on the GPU and on the canvas,
 * and the volume of the same images cut on the CPU and drawn on the GPU,
 * cut on the GPU, and cut and drawn on the CPU.
 */
const PLANAR_PATHS = [
  {
    name: 'the GPU stack image',
    mode: 'stack',
    options: {},
    drawPath: 'frame-gpu',
  },
  {
    name: 'the canvas frame',
    mode: 'stack',
    options: { renderBackend: 'cpu' },
    drawPath: 'frame-cpu',
  },
  {
    name: 'the CPU slice drawn on the GPU',
    mode: 'volume',
    options: {},
    drawPath: 'cpu-gpu',
  },
  {
    name: 'the GPU volume slice',
    mode: 'volume',
    options: { sliceFirst: false },
    drawPath: 'gpuVolume-gpu',
  },
  {
    name: 'the canvas CPU slice',
    mode: 'volume',
    options: { renderBackend: 'cpu' },
    drawPath: 'cpu-cpu',
  },
];

/** The value of the data in a column of the series. */
function bandValue(column) {
  return Math.floor(column / BAND_WIDTH) * BAND_STEP;
}

/**
 * Makes the series of the tests: its images and the volume of the same
 * images hold the value of the band of each column.
 */
async function createBandSeries(id) {
  const series = await createSeries({ id, size: SIZE });
  const volume = cache.getVolume(series.volumeId);

  series.imageIds.forEach((imageId, k) => {
    const image = cache.getImage(imageId);

    for (let j = 0; j < SIZE.rows; j++) {
      for (let i = 0; i < SIZE.columns; i++) {
        image.voxelManager.setAtIJK(i, j, 0, bandValue(i));
        volume.voxelManager.setAtIJK(i, j, k, bandValue(i));
      }
    }

    image.minPixelValue = 0;
    image.maxPixelValue = (BANDS - 1) * BAND_STEP;
  });
  volume.modified();

  return series;
}

/** Makes a viewport of 400 by 300 pixels on a black background. */
function createViewport(renderingEngine, viewportId, viewportType) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType,
    orientation: OrientationAxis.ACQUISITION,
    width: 400,
    height: 300,
    background: [0, 0, 0],
    useEnableElement: true,
  });

  return renderingEngine.getViewport(viewportId);
}

/** Shows the series as a stack or as a volume, with the options of a path. */
async function showSeries(viewport, series, path) {
  const displaySetId = `opacityRule:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(
    displaySetId,
    path.mode === 'stack'
      ? { imageIds: series.imageIds, initialImageIdIndex: 1 }
      : { imageIds: series.imageIds, volumeId: series.volumeId }
  );
  await viewport.setDisplaySets({
    displaySetId,
    options: {
      mode: path.mode,
      orientation: OrientationAxis.ACQUISITION,
      ...path.options,
    },
  });

  return displaySetId;
}

/**
 * Renders the viewport, waits for its IMAGE_RENDERED event and for the
 * draw of a CPU path at rest.
 */
async function renderAndSettle(viewport) {
  await new Promise((resolve) => {
    const finish = () => {
      viewport.element.removeEventListener(Events.IMAGE_RENDERED, finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 500);

    viewport.element.addEventListener(Events.IMAGE_RENDERED, finish);
    viewport.render();
  });
  await new Promise((resolve) =>
    setTimeout(resolve, 3 * CPU_SLICE_REST_DELAY_MS)
  );

  for (let frame = 0; frame < 3; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * The grey of the pixel of the canvas at the middle of each band, on the
 * middle row and slice 1 of the series, divided by 255: the alpha of a
 * white layer over black.
 */
function readBandAlphas(viewport, series) {
  const source = viewport.getCanvas();
  const canvas = document.createElement('canvas');

  canvas.width = source.width;
  canvas.height = source.height;

  const context = canvas.getContext('2d');

  context.drawImage(source, 0, 0);

  const ratio = source.width / source.clientWidth || 1;

  return Array.from({ length: BANDS }, (_, band) => {
    const world = worldOfVoxel(series, [
      band * BAND_WIDTH + BAND_WIDTH / 2,
      SIZE.rows / 2,
      1,
    ]);
    const [x, y] = viewport.worldToCanvas(world);
    const pixel = context.getImageData(
      Math.floor(x * ratio),
      Math.floor(y * ratio),
      1,
      1
    ).data;

    return pixel[0] / 255;
  });
}

/** The largest difference in grey levels between two lists of alphas. */
function largestLevelDifference(alphas, expected) {
  return Math.max(
    ...alphas.map((alpha, band) => Math.abs(255 * alpha - 255 * expected[band]))
  );
}

function setupEngine() {
  return testUtils.setupTestEnvironment({
    renderingEngineId,
    toolGroupIds: ['default'],
  }).renderingEngine;
}

function cleanupEngine() {
  cornerstone3D.displaySetRegistry.clear();
  testUtils.cleanupTestEnvironment({
    renderingEngineId,
    toolGroupIds: ['default'],
  });
}

describe('One opacity rule, opacity * ramp(value) and 0 below the threshold, on every planar render path -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = setupEngine();
  });

  afterEach(function () {
    cleanupEngine();
  });

  PLANAR_PATHS.forEach((path, pathIndex) => {
    it(`draws the alpha of the rule on ${path.name} (${path.drawPath})`, async function () {
      const series = await createBandSeries(`opacityRule${pathIndex}`);
      const rows = [];

      for (const [caseIndex, testCase] of CASES.entries()) {
        const viewport = createViewport(
          renderingEngine,
          `opacityRule${pathIndex}_${caseIndex}`,
          ViewportType.PLANAR
        );
        const displaySetId = await showSeries(viewport, series, path);

        viewport.setDisplaySetAppearance(displaySetId, {
          voiRange: WHITE_WINDOW,
          ...testCase.appearance,
        });
        await renderAndSettle(viewport);

        const alphas = readBandAlphas(viewport, series);

        rows.push({
          case: testCase.name,
          drawPath: drawPathOf(viewport.getRenderPlan()[0]),
          levels: alphas.map((alpha) => Math.round(255 * alpha)),
          expected: testCase.alphas.map((alpha) => Math.round(255 * alpha)),
          largest: largestLevelDifference(alphas, testCase.alphas),
        });

        viewport.setDisplaySetAppearance(displaySetId, {
          opacity: undefined,
          colormap: undefined,
        });
        await renderAndSettle(viewport);

        const removed = readBandAlphas(viewport, series);
        const opaque = Array(BANDS).fill(1);

        rows.push({
          case: `${testCase.name}, then removed`,
          drawPath: drawPathOf(viewport.getRenderPlan()[0]),
          levels: removed.map((alpha) => Math.round(255 * alpha)),
          expected: opaque.map((alpha) => Math.round(255 * alpha)),
          largest: largestLevelDifference(removed, opaque),
        });
      }

      console.log(
        `[OPACITY_RULE]${JSON.stringify({ path: path.drawPath, rows })}`
      );

      rows.forEach((row) => {
        expect(row.drawPath).toBe(path.drawPath);
        expect(row.largest).toBeLessThanOrEqual(TOLERANCE);
      });
    }, 60000);
  });

  /**
   * A colour volume is cut on the GPU also when the options ask for the CPU
   * slice drawn on the GPU, which draws one value per pixel.
   */
  const COLOUR_DRAW_PATHS = [
    'frame-gpu',
    'frame-cpu',
    'gpuVolume-gpu',
    'gpuVolume-gpu',
    'cpu-cpu',
  ];

  it('draws a colour layer with its opacity alone: three components have no value for a ramp', async function () {
    const series = await createSeries({
      id: 'opacityRuleRgb',
      size: SIZE,
      info: { rgb: 1 },
    });
    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      id: 'opacityRuleRgbVolume',
      rows: 32,
      columns: 32,
      slices: 4,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
      rgb: 1,
    });
    const rows = [];

    await cornerstone3D.volumeLoader.createAndCacheVolume(volumeId, {
      imageIds: [],
    });

    for (const [pathIndex, path] of PLANAR_PATHS.entries()) {
      const viewport = createViewport(
        renderingEngine,
        `opacityRuleRgb${pathIndex}`,
        ViewportType.PLANAR
      );
      const displaySetId =
        path.mode === 'stack'
          ? await showSeries(viewport, series, path)
          : `volume:${viewport.id}:${volumeId}`;

      if (path.mode === 'volume') {
        await testUtils.setVolumesOnNextViewport(viewport, [volumeId], {
          orientation: OrientationAxis.AXIAL,
          ...path.options,
        });
      }

      viewport.setDisplaySetAppearance(displaySetId, {
        opacity: 0.5,
        colormap: {
          opacityMapping: [
            { value: 0, opacity: 0 },
            { value: 10000, opacity: 0 },
          ],
          threshold: 10000,
        },
      });
      await renderAndSettle(viewport);

      const shown = getLargestChannel(viewport);

      viewport.setDisplaySetAppearance(displaySetId, { opacity: 1 });
      await renderAndSettle(viewport);

      rows.push({
        drawPath: drawPathOf(viewport.getRenderPlan()[0]),
        ratio: shown / getLargestChannel(viewport),
      });
    }

    console.log(`[OPACITY_RULE_RGB]${JSON.stringify(rows)}`);

    rows.forEach((row, index) => {
      expect(row.drawPath).toBe(COLOUR_DRAW_PATHS[index]);
      expect(Math.abs(row.ratio - 0.5)).toBeLessThanOrEqual(0.02);
    });
  }, 60000);
});

/** The largest colour value of the canvas of a viewport. */
function getLargestChannel(viewport) {
  const source = viewport.getCanvas();
  const canvas = document.createElement('canvas');

  canvas.width = source.width;
  canvas.height = source.height;

  const context = canvas.getContext('2d');

  context.drawImage(source, 0, 0);

  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let largest = 0;

  for (let index = 0; index < data.length; index += 4) {
    largest = Math.max(largest, data[index], data[index + 1], data[index + 2]);
  }

  return largest;
}

describe('One opacity rule on the 3D viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = setupEngine();
  });

  afterEach(function () {
    cleanupEngine();
  });

  /**
   * The opacity function of the volume of a 3D viewport at the value of each
   * band: what the ray cast takes for the opacity of a sample of that value.
   */
  function bandOpacities(viewport) {
    const opacityFunction = viewport
      .getActors()[0]
      .actor.getProperty()
      .getScalarOpacity(0);

    return Array.from({ length: BANDS }, (_, band) =>
      opacityFunction.getValue(band * BAND_STEP)
    );
  }

  async function showOn3D(series, viewportId) {
    const viewport = createViewport(
      renderingEngine,
      viewportId,
      ViewportType.VOLUME_3D
    );
    const displaySetId = `opacityRule3D:${viewportId}`;

    cornerstone3D.displaySetRegistry.add(displaySetId, {
      imageIds: series.imageIds,
      volumeId: series.volumeId,
    });
    await viewport.setDisplaySets({ displaySetId });

    return { viewport, displaySetId };
  }

  it('gives the volume the opacity function of the rule, set at once or one key after the other', async function () {
    const series = await createBandSeries('opacityRule3D');
    const rows = [];

    for (const [caseIndex, testCase] of CASES.entries()) {
      const atOnce = await showOn3D(series, `opacityRule3DAtOnce${caseIndex}`);
      const stepwise = await showOn3D(
        series,
        `opacityRule3DStepwise${caseIndex}`
      );
      const { opacity, colormap = {} } = testCase.appearance;

      atOnce.viewport.setDisplaySetAppearance(
        atOnce.displaySetId,
        testCase.appearance
      );
      stepwise.viewport.setDisplaySetAppearance(stepwise.displaySetId, {
        colormap: { name: 'hsv' },
      });
      Object.entries(colormap).forEach(([key, value]) =>
        stepwise.viewport.setDisplaySetAppearance(stepwise.displaySetId, {
          colormap: { [key]: value },
        })
      );

      if (opacity !== undefined) {
        stepwise.viewport.setDisplaySetAppearance(stepwise.displaySetId, {
          opacity,
        });
      }

      rows.push({
        case: testCase.name,
        atOnce: bandOpacities(atOnce.viewport),
        stepwise: bandOpacities(stepwise.viewport),
        expected: testCase.alphas,
      });
    }

    console.log(`[OPACITY_RULE_3D]${JSON.stringify(rows)}`);

    rows.forEach((row) => {
      row.expected.forEach((alpha, band) => {
        expect(row.atOnce[band]).toBeCloseTo(alpha, 6);
        expect(row.stepwise[band]).toBeCloseTo(alpha, 6);
      });
    });
  }, 60000);

  it('merges a colormap one level deep, as a planar viewport, so that the name stays when only the threshold changes', async function () {
    const series = await createBandSeries('opacityRule3DMerge');
    const { viewport, displaySetId } = await showOn3D(
      series,
      'opacityRule3DMerge'
    );

    viewport.setDisplaySetAppearance(displaySetId, {
      colormap: { name: 'hsv' },
    });
    viewport.setDisplaySetAppearance(displaySetId, {
      colormap: { threshold: 100 },
    });

    expect(viewport.getDisplaySetAppearance(displaySetId).colormap).toEqual({
      name: 'hsv',
      threshold: 100,
    });
    expect(
      viewport.getEffectiveDisplaySetAppearance(displaySetId).colormap
    ).toEqual({ name: 'hsv', threshold: 100 });

    viewport.setDisplaySetAppearance(displaySetId, {
      colormap: { threshold: null },
    });

    expect(viewport.getDisplaySetAppearance(displaySetId).colormap).toEqual({
      name: 'hsv',
      threshold: null,
    });
    expect(bandOpacities(viewport)).toEqual(Array(BANDS).fill(1));
  }, 60000);
});
