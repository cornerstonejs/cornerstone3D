import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache, viewportProjection } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const WIDTH = 400;
const HEIGHT = 300;

/** Makes a direct next planar viewport on a magenta background. */
function createNextViewport(renderingEngine, viewportId) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.ACQUISITION,
    width: WIDTH,
    height: HEIGHT,
    background: [1, 0, 1],
    useEnableElement: true,
  });

  return renderingEngine.getViewport(viewportId);
}

/** Renders the viewport and resolves at its next IMAGE_RENDERED event. */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/**
 * Shows one image of 64 by 64 pixels of 1 mm as a stack, drawn by the given
 * render backend.
 */
async function showStack(viewport, renderBackend) {
  const displaySetId = `stack:${viewport.id}`;
  const imageIds = [0, 1].map((sliceIndex) =>
    testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      id: 'stretchStack',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex,
    })
  );

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds,
    initialImageIdIndex: 0,
  });
  await viewport.setDisplaySets({ displaySetId, options: { renderBackend } });
  await renderAndWait(viewport);
}

/**
 * Shows a volume of 32 columns, 30 rows and 6 slices of 1 mm in the axial
 * plane, drawn by the given render backend.
 */
async function showVolume(viewport, renderBackend) {
  const displaySetId = `volume:${viewport.id}`;
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'stretchVolume',
    id: 'stretchVolume',
    rows: 30,
    columns: 32,
    slices: 6,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  if (!cache.getVolume(volumeId)) {
    await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  }

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.AXIAL, renderBackend },
  });
  await renderAndWait(viewport);
}

/** The canvas that shows the viewport. */
function getShownCanvas(viewport) {
  return Array.from(viewport.element.querySelectorAll('canvas')).find(
    (canvas) => canvas.style.display !== 'none' && canvas.width
  );
}

/**
 * The box of the pixels of the shown canvas that are not the magenta
 * background, as `{ left, right, top, bottom }` in canvas pixels.
 */
function getDrawnBox(viewport) {
  const canvas = getShownCanvas(viewport);
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const box = { left: width, right: -1, top: height, bottom: -1 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const isBackground =
        pixels[index] > 200 &&
        pixels[index + 1] < 60 &&
        pixels[index + 2] > 200;

      if (!isBackground) {
        box.left = Math.min(box.left, x);
        box.right = Math.max(box.right, x);
        box.top = Math.min(box.top, y);
        box.bottom = Math.max(box.bottom, y);
      }
    }
  }

  return box;
}

/** The scale pair of the view, read through the projection. */
function getScale(viewport) {
  return viewportProjection.getPresentation(viewport, {
    selector: { scale: true },
  }).scale;
}

/**
 * Shows the content of a mode on a viewport, stretches the view with a scale
 * pair and gives what was read and drawn before and after.
 */
async function stretch(renderingEngine, mode, renderBackend) {
  const viewport = createNextViewport(
    renderingEngine,
    `${mode}-${renderBackend}`
  );

  if (mode === 'stack') {
    await showStack(viewport, renderBackend);
  } else {
    await showVolume(viewport, renderBackend);
  }

  const before = { scale: getScale(viewport), box: getDrawnBox(viewport) };

  viewport.setViewState({ scale: [0.5, 1] });
  await renderAndWait(viewport);

  return {
    mode: viewport.getCurrentMode(),
    shownOnCpu: getShownCanvas(viewport) !== viewport.canvas,
    before,
    after: { scale: getScale(viewport), box: getDrawnBox(viewport) },
    viewState: viewport.getViewState().scale,
  };
}

/**
 * Shows the content of a mode on a viewport, sets a display area that shows
 * half of the image in each direction with the point a quarter into the
 * image at the centre of the canvas, and gives what was drawn before and
 * where that point lies after.
 */
async function showDisplayArea(renderingEngine, mode, renderBackend) {
  const viewport = createNextViewport(
    renderingEngine,
    `${mode}-${renderBackend}-area`
  );

  if (mode === 'stack') {
    await showStack(viewport, renderBackend);
  } else {
    await showVolume(viewport, renderBackend);
  }

  const box = getDrawnBox(viewport);
  const quarterPoint = viewport.canvasToWorld([
    box.left + widthOf(box) / 4,
    box.top + heightOf(box) / 4,
  ]);

  viewport.setViewState({
    displayArea: {
      imageArea: [0.5, 0.5],
      imageCanvasPoint: {
        imagePoint: [0.25, 0.25],
        canvasPoint: [0.5, 0.5],
      },
    },
  });
  await renderAndWait(viewport);

  return {
    mode: viewport.getCurrentMode(),
    quarterPointOnCanvas: viewport.worldToCanvas(quarterPoint),
    zoom: getScale(viewport),
    box: getDrawnBox(viewport),
  };
}

function widthOf(box) {
  return box.right - box.left + 1;
}

function heightOf(box) {
  return box.bottom - box.top + 1;
}

describe('The stretch of a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    cornerstone3D.displaySetRegistry.clear?.();
  });

  ['stack', 'volume'].forEach((mode) => {
    it(`is the scale pair of the view state in ${mode} mode, and the CPU draws what the GPU draws`, async function () {
      const gpu = await stretch(renderingEngine, mode, 'gpu');
      const cpu = await stretch(renderingEngine, mode, 'cpu');

      expect(gpu.mode).toBe(mode);
      expect(cpu.mode).toBe(mode);
      expect(gpu.shownOnCpu).toBe(false);
      expect(cpu.shownOnCpu).toBe(true);

      [gpu, cpu].forEach(({ before, after, viewState }) => {
        expect(before.scale[0]).toBeCloseTo(1, 5);
        expect(before.scale[1]).toBeCloseTo(1, 5);
        expect(after.scale[0]).toBeCloseTo(0.5, 5);
        expect(after.scale[1]).toBeCloseTo(1, 5);
        expect(viewState).toEqual([0.5, 1]);
        expect(heightOf(before.box)).toBeGreaterThan(HEIGHT - 3);
        expect(
          Math.abs(widthOf(after.box) - widthOf(before.box) / 2)
        ).toBeLessThan(2);
        expect(
          Math.abs(heightOf(after.box) - heightOf(before.box))
        ).toBeLessThan(2);
      });

      ['left', 'right', 'top', 'bottom'].forEach((side) => {
        expect(
          Math.abs(cpu.before.box[side] - gpu.before.box[side])
        ).toBeLessThan(2);
        expect(
          Math.abs(cpu.after.box[side] - gpu.after.box[side])
        ).toBeLessThan(2);
      });
    });

    it(`takes a display area as a key of the view state in ${mode} mode, and the CPU draws what the GPU draws`, async function () {
      const gpu = await showDisplayArea(renderingEngine, mode, 'gpu');
      const cpu = await showDisplayArea(renderingEngine, mode, 'cpu');

      [gpu, cpu].forEach((result) => {
        expect(result.mode).toBe(mode);
        expect(
          Math.abs(result.quarterPointOnCanvas[0] - WIDTH / 2)
        ).toBeLessThan(1.5);
        expect(
          Math.abs(result.quarterPointOnCanvas[1] - HEIGHT / 2)
        ).toBeLessThan(1.5);
        expect(result.zoom[0]).toBeCloseTo(2, 1);
        expect(result.zoom[1]).toBeCloseTo(2, 1);
      });

      ['left', 'right', 'top', 'bottom'].forEach((side) => {
        expect(Math.abs(cpu.box[side] - gpu.box[side])).toBeLessThan(2);
      });
    });
  });
});
