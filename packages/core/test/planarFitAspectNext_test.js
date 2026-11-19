import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities } = cornerstone3D;
const { ViewportType, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'fitAspectNext';
const PIXEL_TOLERANCE = 2;

/**
 * What `setAspectRatio([1, 4], { fit: true })` gives on a legacy adapter of
 * 400 by 400 pixels that shows the image of the tests as a stack: the size
 * of the picture on the canvas, and the scale.
 */
const LEGACY_ADAPTER_FIT_SIZE = [200, 400];
const LEGACY_ADAPTER_FIT_SCALE = [0.5, 2];

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
 * Makes a viewport of 400 by 400 pixels with the magenta background of the
 * tests, so that the picture can be told from the background.
 */
function createViewport(renderingEngine, viewportType) {
  testUtils.createViewports(renderingEngine, {
    viewportType,
    viewportId,
    width: 400,
    height: 400,
  });

  return renderingEngine.getViewport(viewportId);
}

/** The id of an image of 100 columns and 50 rows of 1 mm. */
function createImageId() {
  return testUtils.encodeImageIdInfo({
    loader: 'fakeImageLoader',
    name: 'fitAspectURI',
    rows: 50,
    columns: 100,
    barStart: 10,
    barWidth: 5,
    xSpacing: 1,
    ySpacing: 1,
    sliceIndex: 0,
  });
}

/**
 * Makes a volume of 5 slices whose axial slice is 100 mm wide and 50 mm high.
 * The fake loader takes `rows` as the first dimension of the volume.
 */
async function createVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'fitAspectVolumeURI',
    rows: 100,
    columns: 50,
    slices: 5,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/**
 * Shows the image or the volume on a direct next planar viewport, on the GPU
 * or pinned to the CPU.
 */
async function showOnNextViewport(viewport, mode, renderBackend) {
  const options = { renderBackend };

  if (mode === 'stack') {
    await testUtils.setStackOnNextViewport(
      viewport,
      [createImageId()],
      0,
      options
    );
  } else {
    await testUtils.setVolumesOnNextViewport(
      viewport,
      [await createVolume()],
      options
    );
  }

  expect(viewport.getCurrentMode()).toBe(mode);

  if (renderBackend === 'cpu') {
    testUtils.expectNextViewportToDrawOnCPU(viewport);
  }

  await renderAndWait(viewport);
}

/**
 * The width and the height in CSS pixels of what the viewport drew that is
 * not its magenta background: the size of the picture on the canvas.
 */
function getDrawnSize(viewport) {
  const source = viewport.getCanvas();
  const canvas = document.createElement('canvas');

  canvas.width = source.width;
  canvas.height = source.height;

  const context = canvas.getContext('2d');

  context.drawImage(source, 0, 0);

  const { data, width, height } = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );
  let [left, right, top, bottom] = [width, -1, height, -1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const isBackground =
        data[offset] > 200 && data[offset + 1] < 80 && data[offset + 2] > 200;

      if (!isBackground) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return [
    ((right - left + 1) * viewport.element.clientWidth) / width,
    ((bottom - top + 1) * viewport.element.clientHeight) / height,
  ];
}

/** Checks the size of the picture on the canvas, to two pixels. */
function expectDrawnSize(viewport, [expectedWidth, expectedHeight]) {
  const [drawnWidth, drawnHeight] = getDrawnSize(viewport);

  expect(Math.abs(drawnWidth - expectedWidth)).toBeLessThanOrEqual(
    PIXEL_TOLERANCE
  );
  expect(Math.abs(drawnHeight - expectedHeight)).toBeLessThanOrEqual(
    PIXEL_TOLERANCE
  );
}

/** Sets a view state patch, renders, and resolves when it is drawn. */
function setViewStateAndWait(viewport, viewStatePatch) {
  viewport.setViewState(viewStatePatch);

  return renderAndWait(viewport);
}

describe("The fit of a stretched picture, scaleMode 'fitAspect', on a direct next planar viewport -- ", () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  [
    ['stack', 'gpu'],
    ['stack', 'cpu'],
    ['volume', 'gpu'],
    ['volume', 'cpu'],
  ].forEach(([mode, renderBackend]) => {
    it(`fits a picture of 100 by 50 mm stretched by the scale pair into the canvas, again after a resize, and a reset goes back to the plain fit: ${mode} mode on the ${renderBackend}`, async function () {
      const viewport = createViewport(renderingEngine, ViewportType.PLANAR);

      await showOnNextViewport(viewport, mode, renderBackend);
      expectDrawnSize(viewport, [400, 200]);

      await setViewStateAndWait(viewport, {
        scale: [0.25, 1],
        scaleMode: 'fitAspect',
      });
      expectDrawnSize(viewport, [200, 400]);

      await setViewStateAndWait(viewport, {
        scale: [3, 1],
        scaleMode: 'fitAspect',
      });
      expectDrawnSize(viewport, [400, 400 / 6]);

      await setViewStateAndWait(viewport, {
        scale: [0.25, 1],
        scaleMode: 'fitAspect',
      });
      viewport.element.style.width = '600px';
      viewport.element.style.height = '300px';
      renderingEngine.resize(true, true);
      await renderAndWait(viewport);
      expectDrawnSize(viewport, [150, 300]);
      expect(viewport.getViewState().scaleMode).toBe('fitAspect');

      viewport.resetViewState();
      await renderAndWait(viewport);
      expectDrawnSize(viewport, [600, 300]);
      expect(viewport.getViewState().scale).toEqual([1, 1]);
      expect(viewport.getViewState().scaleMode).toBe('fit');
    });
  });

  it('gives the picture and the scale that setAspectRatio with fit gives on a legacy adapter, and half that scale gives half the picture', async function () {
    const viewport = createViewport(renderingEngine, ViewportType.PLANAR);

    await showOnNextViewport(viewport, 'stack', 'gpu');
    await setViewStateAndWait(viewport, {
      scale: [0.25, 1],
      scaleMode: 'fitAspect',
    });

    expectDrawnSize(viewport, LEGACY_ADAPTER_FIT_SIZE);
    expectDrawnSize(viewport, [200, 400]);
    viewport.getScale().forEach((value, axis) => {
      expect(value).toBeCloseTo(LEGACY_ADAPTER_FIT_SCALE[axis], 5);
    });

    viewport.setScale(viewport.getScale().map((value) => value / 2));
    await renderAndWait(viewport);
    expectDrawnSize(viewport, [100, 200]);
    expect(viewport.getViewState().scaleMode).toBe('fit');
  });

  it("keeps the plain fit of a picture that is not stretched, as 'fit'", async function () {
    const viewport = createViewport(renderingEngine, ViewportType.PLANAR);

    await showOnNextViewport(viewport, 'stack', 'gpu');
    await setViewStateAndWait(viewport, {
      scale: [2, 2],
      scaleMode: 'fitAspect',
    });

    expect(viewport.getScale()).toEqual([2, 2]);
    expect(viewport.getZoom()).toBe(2);
  });
});
