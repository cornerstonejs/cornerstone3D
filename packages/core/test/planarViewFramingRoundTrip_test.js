import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, utilities, volumeLoader, cache } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * The views whose framing a round trip must give back: each scale mode of
 * the view state, a stretched scale, and a display area in each scale mode,
 * also with a scale of its own. On a viewport of another size the framing of
 * a panned view shows the world point that was at the centre of the canvas
 * at its centre, at the same zoom against the fit.
 */
const CASES = [
  {
    name: 'fit, zoomed and panned',
    viewState: { scale: [2, 2], scaleMode: 'fit', anchorCanvas: [0.6, 0.45] },
    panned: true,
  },
  { name: 'fit, stretched', viewState: { scale: [2, 1], scaleMode: 'fit' } },
  {
    name: 'fitAspect, stretched',
    viewState: { scale: [2, 1], scaleMode: 'fitAspect' },
  },
  {
    name: 'fitWidth without a display area',
    viewState: { scale: [1.5, 1.5], scaleMode: 'fitWidth' },
  },
  {
    name: 'fitHeight without a display area',
    viewState: { scale: [1.5, 1.5], scaleMode: 'fitHeight' },
  },
  {
    name: 'absolute without a display area',
    viewState: { scale: [1.5, 1.5], scaleMode: 'absolute' },
  },
  {
    name: 'a display area in fit',
    viewState: {
      displayArea: {
        imageArea: [0.5, 0.5],
        imageCanvasPoint: { imagePoint: [0.25, 0.25], canvasPoint: [0.5, 0.5] },
      },
    },
  },
  {
    name: 'a display area in fitWidth',
    viewState: {
      displayArea: { imageArea: [0.5, 0.5], scaleMode: 'fitWidth' },
    },
  },
  {
    name: 'a display area in fitHeight',
    viewState: {
      displayArea: { imageArea: [0.5, 0.5], scaleMode: 'fitHeight' },
    },
  },
  {
    name: 'a display area in absolute',
    viewState: {
      displayArea: { imageArea: [0.5, 0.25], scaleMode: 'absolute' },
    },
  },
  {
    name: 'a display area with a stretched scale of its own',
    viewState: {
      displayArea: { imageArea: [0.75, 0.75] },
      scale: [1.5, 1],
      scaleMode: 'fit',
      anchorCanvas: [0.5, 0.5],
    },
  },
];

const MODES = [
  ['stack', showStack],
  ['volume', showVolume],
];

/** Waits for the given number of animation frames. */
async function frames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/** Makes a direct planar viewport of the given size. */
function createPlanarViewport(renderingEngine, viewportId, width, height) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.PLANAR,
    orientation: OrientationAxis.ACQUISITION,
    width,
    height,
    useEnableElement: true,
  });

  return renderingEngine.getViewport(viewportId);
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

/** Draws the viewport and reads its picture. */
async function pictureOf(viewport) {
  await renderAndWait(viewport);

  return readPixels(viewport.getCanvas());
}

/** Gives the viewport a new size and resizes the rendering engine. */
async function resize(renderingEngine, viewports, width, height) {
  for (const viewport of viewports) {
    viewport.element.style.width = `${width}px`;
    viewport.element.style.height = `${height}px`;
  }

  renderingEngine.resize(true, true);
  await frames(2);
}

describe('setViewFraming(getViewFraming()) on a planar viewport -- ', () => {
  let renderingEngine;
  let series;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    series = await createSeries({ id: 'framingRoundTrip' });
  }, 15000);

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  for (const [mode, show] of MODES) {
    for (const { name, viewState, panned } of CASES) {
      it(`changes no pixel for ${name}, in ${mode} mode`, async function () {
        const viewport = createPlanarViewport(
          renderingEngine,
          'framingSame',
          400,
          300
        );

        await show(viewport, series, 3);
        viewport.setViewState(viewState);

        const before = await pictureOf(viewport);

        viewport.setViewFraming(viewport.getViewFraming());

        expect(countChangedPixels(await pictureOf(viewport), before)).toBe(0);
        expect(viewport.getViewState().scaleMode).toBe(
          viewState.displayArea?.scaleMode ?? viewState.scaleMode ?? 'fit'
        );

        viewport.setViewFraming({
          zoom: viewport.getViewFraming().zoom * 1.25,
        });

        expect(
          countChangedPixels(await pictureOf(viewport), before)
        ).toBeGreaterThan(1000);
      }, 20000);

      it(`changes no pixel for ${name} after a resize, and resizes as the view it was read from, in ${mode} mode`, async function () {
        const source = createPlanarViewport(
          renderingEngine,
          'framingResizeSource',
          400,
          300
        );
        const target = createPlanarViewport(
          renderingEngine,
          'framingResizeTarget',
          400,
          300
        );

        await show(source, series, 3);
        await show(target, series, 3);
        source.setViewState(viewState);
        target.setViewState(viewState);
        await renderAndWait(source);
        target.setViewFraming(target.getViewFraming());
        await resize(renderingEngine, [source, target], 250, 330);

        const resized = await pictureOf(source);

        expect(countChangedPixels(await pictureOf(target), resized)).toBe(0);

        source.setViewFraming(source.getViewFraming());

        expect(countChangedPixels(await pictureOf(source), resized)).toBe(0);
      }, 20000);

      it(`gives the same fit on a viewport of another size for ${name}, in ${mode} mode`, async function () {
        const source = createPlanarViewport(
          renderingEngine,
          'framingOtherSizeSource',
          400,
          300
        );
        const direct = createPlanarViewport(
          renderingEngine,
          'framingOtherSizeDirect',
          250,
          330
        );
        const copied = createPlanarViewport(
          renderingEngine,
          'framingOtherSizeCopied',
          250,
          330
        );

        await show(source, series, 3);
        await show(direct, series, 3);
        await show(copied, series, 3);
        source.setViewState(viewState);
        await renderAndWait(source);
        direct.setViewState(
          panned
            ? {
                ...viewState,
                anchorCanvas: [0.5, 0.5],
                anchorWorld: source.canvasToWorld([200, 150]),
              }
            : viewState
        );
        copied.setViewFraming(source.getViewFraming());

        expect(
          countChangedPixels(await pictureOf(copied), await pictureOf(direct))
        ).toBe(0);
      }, 20000);
    }
  }
});

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

/** Makes a direct 3D viewport of the given size that shows a volume. */
async function show3DViewport(renderingEngine, viewportId, volumeId, size) {
  const element = document.createElement('div');
  const displaySetId = `framingRoundTrip3D:${viewportId}`;

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
  await viewport.setDisplaySets({
    displaySetId,
  });
  viewport.render();
  await frames(3);

  return viewport;
}

/**
 * Turns the camera of a 3D viewport away from its orientation, about the
 * view up, and gives it a zoom of 2 with a pan.
 */
async function turnZoomAndPan(viewport) {
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
  viewport.setViewFraming({ zoom: 2, pan: [15, -10], rotation: 20 });
  viewport.render();
  await frames(3);
}

/** Reads the picture of a 3D viewport after it drew. */
async function picture3D(viewport) {
  viewport.render();
  await frames(3);

  return readPixels(viewport.canvas);
}

function expectVectorClose(actual, expected, context) {
  expected.forEach((value, axis) => {
    expect(actual[axis]).withContext(context).toBeCloseTo(value, 4);
  });
}

describe('setViewFraming(getViewFraming()) on a 3D viewport -- ', () => {
  let renderingEngine;
  let volumeId;

  beforeEach(async function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
    volumeId = await createVolume('framingRoundTrip3D');
  }, 15000);

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('changes no pixel of a turned, zoomed and panned view', async function () {
    const viewport = await show3DViewport(
      renderingEngine,
      'framing3DSame',
      volumeId,
      [400, 300]
    );

    await turnZoomAndPan(viewport);

    const before = await picture3D(viewport);

    viewport.setViewFraming(viewport.getViewFraming());

    expect(countChangedPixels(await picture3D(viewport), before)).toBe(0);

    viewport.setViewFraming({ zoom: viewport.getViewFraming().zoom * 1.25 });

    expect(
      countChangedPixels(await picture3D(viewport), before)
    ).toBeGreaterThan(1000);
  }, 20000);

  it('changes no pixel after a resize', async function () {
    const viewport = await show3DViewport(
      renderingEngine,
      'framing3DResize',
      volumeId,
      [400, 300]
    );

    await turnZoomAndPan(viewport);
    viewport.element.style.width = '300px';
    renderingEngine.resize(true, true);
    await frames(3);

    const before = await picture3D(viewport);

    viewport.setViewFraming(viewport.getViewFraming());

    expect(countChangedPixels(await picture3D(viewport), before)).toBe(0);
  }, 20000);

  it('gives the direction, the zoom against the fit and the world point at the centre to a viewport of another size', async function () {
    const source = await show3DViewport(
      renderingEngine,
      'framing3DSource',
      volumeId,
      [400, 300]
    );
    const target = await show3DViewport(
      renderingEngine,
      'framing3DTarget',
      volumeId,
      [250, 330]
    );

    await turnZoomAndPan(source);

    const framing = source.getViewFraming();

    target.setViewFraming(framing);
    target.render();
    await frames(3);

    const copied = target.getViewFraming();

    expectVectorClose(
      copied.camera.viewPlaneNormal,
      framing.camera.viewPlaneNormal,
      'view plane normal'
    );
    expectVectorClose(copied.camera.viewUp, framing.camera.viewUp, 'view up');
    expect(copied.zoom).toBeCloseTo(framing.zoom, 4);
    expect(copied.worldPan[0]).toBeCloseTo(framing.worldPan[0], 4);
    expect(copied.worldPan[1]).toBeCloseTo(framing.worldPan[1], 4);
    expectVectorClose(
      copied.camera.focalPoint,
      framing.camera.focalPoint,
      'focal point'
    );
    expect(copied.rotation).toBeCloseTo(framing.rotation, 3);
  }, 20000);
});
