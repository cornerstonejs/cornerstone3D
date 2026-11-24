import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const {
  Enums,
  volumeLoader,
  utilities,
  cache,
  viewportProjection,
  viewportHasZoom,
  viewportHasPan,
} = cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();
const WIDTH = 400;
const HEIGHT = 300;
const CENTRE = [WIDTH / 2, HEIGHT / 2];

/**
 * The two projections of a 3D camera. In perspective the fit shows the
 * volume small, so its pixels are measured from a zoom of 8. In parallel the
 * fit fills the height of the canvas and no more.
 */
const PROJECTIONS = [
  { name: 'a parallel camera', parallelProjection: true, startZoom: 1 },
  { name: 'a perspective camera', parallelProjection: false, startZoom: 8 },
];

/**
 * Gives 0.5 for every call of `Math.random` from the vtk.js volume mapper,
 * which fills the jitter texture of its ray caster with them, so the edge of
 * the drawn volume does not move by the jitter.
 */
function drawWithoutJitter() {
  const random = Math.random;

  spyOn(Math, 'random').and.callFake(() =>
    (new Error().stack || '').includes('VolumeMapper') ? 0.5 : random()
  );
}

/** Makes a 3D viewport of 400 by 300 pixels, axial, on magenta. */
function createViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    viewportId: 'zoomPan3D',
    viewportType: ViewportType.VOLUME_3D,
    orientation: OrientationAxis.AXIAL,
    width: WIDTH,
    height: HEIGHT,
    useEnableElement: true,
  });

  return renderingEngine.getViewport('zoomPan3D');
}

/**
 * Makes a volume of the fake volume loader, 40 columns and 30 rows of 1 mm
 * and 2 slices of 1 mm, fills it with one value and shows it. The volume is
 * thin, so a perspective camera draws it almost as a parallel one does.
 */
async function showVolume(viewport) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    id: 'zoomPanMembers3D',
    rows: 30,
    columns: 40,
    slices: 2,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  const { voxelManager, dimensions, imageIds } = cache.getVolume(volumeId);

  for (let k = 0; k < dimensions[2]; k++) {
    for (let j = 0; j < dimensions[1]; j++) {
      for (let i = 0; i < dimensions[0]; i++) {
        voxelManager.setAtIJK(i, j, k, 255);
      }
    }
  }

  cornerstone3D.displaySetRegistry.add('zoomPanMembers3D', {
    imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId: 'zoomPanMembers3D',
    options: { renderMode: 'vtkVolume3d' },
  });
  viewport.resetViewState();
}

/**
 * Renders the viewport and measures its picture: the box of the pixels that
 * are not the magenta background, in canvas pixels of the element. Its
 * width, its height and its centre.
 */
async function drawnBoxOf(viewport) {
  const rendered = new Promise((resolve) =>
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    })
  );

  viewport.render();
  await rendered;

  const image = new Image();

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = viewport.canvas.toDataURL('image/png');
  });

  const canvas = document.createElement('canvas');

  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d');

  context.drawImage(image, 0, 0);

  const { data } = context.getImageData(0, 0, image.width, image.height);
  const perElementPixel = image.width / WIDTH;
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4;
      const isBackground =
        data[offset] > 240 && data[offset + 1] < 15 && data[offset + 2] > 240;

      if (!isBackground) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    }
  }

  return {
    width: (right - left) / perElementPixel,
    height: (bottom - top) / perElementPixel,
    centre: [
      (left + right) / 2 / perElementPixel,
      (top + bottom) / 2 / perElementPixel,
    ],
  };
}

/** The zoom and the pan of the viewport from the projection service. */
function presentationOf(viewport) {
  const { zoom, pan } = viewportProjection.getFraming(viewport, {
    selector: { zoom: true, pan: true },
  });

  return { zoom, pan };
}

/** Applies a presentation patch through the projection service. */
function present(viewport, presentation, options) {
  viewport.setViewState(
    viewportProjection.withFraming(viewport, presentation, undefined, options)
  );
}

/** The distance on the canvas between two world points. */
function canvasDistance(viewport, worldA, worldB) {
  const a = viewport.worldToCanvas(worldA);
  const b = viewport.worldToCanvas(worldB);

  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Two world points in the focal plane of the camera, 10 mm to each side of
 * the focal point along the view right: a known object of 20 mm.
 */
function objectAtFocalPoint(viewport) {
  const { focalPoint, viewUp, viewPlaneNormal } = viewport.getViewState();
  const right = [
    viewUp[1] * viewPlaneNormal[2] - viewUp[2] * viewPlaneNormal[1],
    viewUp[2] * viewPlaneNormal[0] - viewUp[0] * viewPlaneNormal[2],
    viewUp[0] * viewPlaneNormal[1] - viewUp[1] * viewPlaneNormal[0],
  ];

  return [-10, 10].map((offset) =>
    focalPoint.map((value, axis) => value + offset * right[axis])
  );
}

function expectClose(actual, expected, precision = 2) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], precision)
  );
}

/** Expects two lengths in pixels to differ by no more than a tolerance. */
function expectWithin(actual, expected, tolerance, context) {
  expect(Math.abs(actual - expected))
    .withContext(`${context}: ${actual} against ${expected}`)
    .toBeLessThanOrEqual(tolerance);
}

/** Collects the details of an event fired on the element of a viewport. */
function recordEvents(viewport, eventName) {
  const details = [];

  viewport.element.addEventListener(eventName, (event) =>
    details.push(event.detail)
  );

  return details;
}

/**
 * The checks of the four members that hold for every camera: against a
 * known object at the focal point and against the centre of the fit.
 */
function checkMembers(viewport) {
  viewport.resetViewState();

  const fit = viewport.getViewState();
  const object = objectAtFocalPoint(viewport);
  const sizeAtFit = canvasDistance(viewport, ...object);

  expect(viewport.getZoom()).toBeCloseTo(1, 6);
  expectClose(viewport.getPan(), [0, 0], 4);

  viewport.setZoom(0.5);

  expect(viewport.getZoom()).toBeCloseTo(0.5, 6);
  expectClose(viewport.getPan(), [0, 0], 4);
  expect(canvasDistance(viewport, ...object)).toBeCloseTo(sizeAtFit / 2, 1);
  expectClose(viewport.worldToCanvas(fit.focalPoint), CENTRE, 1);

  viewport.setPan([40, -25]);

  expect(viewport.getZoom()).toBeCloseTo(0.5, 6);
  expectClose(viewport.getPan(), [40, -25], 4);
  expectClose(
    viewport.worldToCanvas(fit.focalPoint),
    [CENTRE[0] + 40, CENTRE[1] - 25],
    1
  );

  viewport.setZoom(2);

  expect(viewport.getZoom()).toBeCloseTo(2, 6);
  expect(canvasDistance(viewport, ...object)).toBeCloseTo(2 * sizeAtFit, 1);

  viewport.setPan([-30, 12]);

  expectClose(viewport.getPan(), [-30, 12], 4);
  expectClose(
    viewport.worldToCanvas(fit.focalPoint),
    [CENTRE[0] - 30, CENTRE[1] + 12],
    1
  );

  viewport.resetViewState();

  expect(viewport.getZoom()).toBeCloseTo(1, 6);
  expectClose(viewport.getPan(), [0, 0], 4);
}

describe('getZoom, setZoom, getPan and setPan of a 3D viewport -- ', () => {
  let renderingEngine;
  let viewport;

  beforeEach(async function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
    drawWithoutJitter();
    viewport = createViewport(renderingEngine);
    await showVolume(viewport);
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('has the zoom and the pan members that viewportHasZoom and viewportHasPan ask for', function () {
    expect(viewportHasZoom(viewport)).toBe(true);
    expect(viewportHasPan(viewport)).toBe(true);
  });

  PROJECTIONS.forEach(({ name, parallelProjection, startZoom }) => {
    describe(`with ${name} -- `, () => {
      beforeEach(function () {
        viewport.setViewState({ parallelProjection });
        viewport.resetViewState();
      });

      it('halves the size of the drawn volume with setZoom(0.5) and gives the zoom with getZoom', async function () {
        if (startZoom !== 1) {
          viewport.setZoom(startZoom);
        }

        const before = await drawnBoxOf(viewport);

        expect(before.height).toBeGreaterThan(200);
        expect(before.height).toBeLessThanOrEqual(HEIGHT);
        expect(before.width).toBeLessThan(WIDTH);

        for (const factor of [0.5, 0.25]) {
          viewport.setZoom(startZoom * factor);

          const after = await drawnBoxOf(viewport);
          const context = `at ${factor} of the zoom`;

          expect(viewport.getZoom()).toBeCloseTo(startZoom * factor, 6);
          expectWithin(
            after.width,
            before.width * factor,
            3,
            `width ${context}`
          );
          expectWithin(
            after.height,
            before.height * factor,
            3,
            `height ${context}`
          );
          expectWithin(after.centre[0], before.centre[0], 2, `x ${context}`);
          expectWithin(after.centre[1], before.centre[1], 2, `y ${context}`);
        }
      });

      it('moves the drawn volume by the canvas pixels of setPan at any zoom and gives them with getPan', async function () {
        viewport.setZoom(startZoom * 0.5);

        const before = await drawnBoxOf(viewport);

        viewport.setPan([40, -25]);

        const panned = await drawnBoxOf(viewport);

        expectClose(viewport.getPan(), [40, -25], 4);
        expectWithin(panned.centre[0], before.centre[0] + 40, 2, 'x');
        expectWithin(panned.centre[1], before.centre[1] - 25, 2, 'y');
        expectWithin(panned.width, before.width, 2, 'width');

        viewport.setZoom(startZoom * 0.25);
        viewport.setPan([-60, 30]);

        const pannedAtOtherZoom = await drawnBoxOf(viewport);

        expectClose(viewport.getPan(), [-60, 30], 4);
        expectWithin(
          pannedAtOtherZoom.centre[0],
          before.centre[0] - 60,
          2,
          'x at the other zoom'
        );
        expectWithin(
          pannedAtOtherZoom.centre[1],
          before.centre[1] + 30,
          2,
          'y at the other zoom'
        );
        expectWithin(
          pannedAtOtherZoom.width,
          before.width / 2,
          3,
          'width at the other zoom'
        );
      });

      it('zooms and pans a known object and the centre of the fit, and goes back to zoom 1 and pan [0, 0] on a reset', function () {
        checkMembers(viewport);
      });

      it('does the same after an orbit of the camera, against the fit of the direction now', function () {
        viewport.setViewReference({
          viewPlaneNormal: [0.6, 0, 0.8],
          viewUp: [0, 1, 0],
        });

        checkMembers(viewport);

        viewport.setViewReference({
          viewPlaneNormal: [0, -1, 0],
          viewUp: [0, 0, 1],
        });

        checkMembers(viewport);
      });

      it('writes the camera that a write through viewportProjection writes', function () {
        const cameraOf = () => {
          const { focalPoint, position, parallelScale, viewUp, viewAngle } =
            viewport.getViewState();

          return [
            ...focalPoint,
            ...position,
            parallelScale,
            ...viewUp,
            viewAngle,
          ];
        };

        viewport.setViewReference({
          viewPlaneNormal: [0.6, 0, 0.8],
          viewUp: [0, 1, 0],
        });
        viewport.resetViewState();
        present(viewport, { zoom: 0.5 });

        const zoomedByProjection = cameraOf();

        present(viewport, { pan: [80, -50] });

        const pannedByProjection = cameraOf();

        viewport.resetViewState();
        present(viewport, { zoom: 3 }, { anchorCanvas: [310, 90] });

        const anchoredByProjection = cameraOf();

        viewport.resetViewState();
        viewport.setZoom(0.5);

        expectClose(cameraOf(), zoomedByProjection, 3);
        expect(viewport.getZoom()).toBeCloseTo(
          presentationOf(viewport).zoom,
          9
        );

        viewport.setPan([40, -25]);

        expectClose(cameraOf(), pannedByProjection, 3);
        expectClose(presentationOf(viewport).pan, [80, -50], 4);
        expectClose(
          viewport.getPan(),
          presentationOf(viewport).pan.map((value) => value * 0.5),
          4
        );

        viewport.resetViewState();
        viewport.setZoom(3, [310, 90]);

        expectClose(cameraOf(), anchoredByProjection, 3);
      });

      it('keeps the world point of the canvas point of setZoom under that point', function () {
        const canvasPoint = [310, 90];
        const underPoint = viewport.canvasToWorld(canvasPoint);

        viewport.setZoom(3, canvasPoint);

        expect(viewport.getZoom()).toBeCloseTo(3, 6);
        expectClose(viewport.worldToCanvas(underPoint), canvasPoint, 1);
      });
    });
  });

  it('fires CAMERA_MODIFIED once for each write of a member, as a write of the view state does', function () {
    const events = recordEvents(viewport, Events.CAMERA_MODIFIED);

    viewport.setViewState(
      viewportProjection.withFraming(viewport, { zoom: 2 })
    );

    const perViewStateWrite = events.length;

    expect(perViewStateWrite).toBe(1);

    viewport.setZoom(0.5);

    expect(events.length).toBe(2 * perViewStateWrite);
    expect(events[1].camera.parallelScale).toBeCloseTo(
      viewport.getViewState().parallelScale,
      6
    );
    expect(events[1].previousCamera.parallelScale).toBeCloseTo(
      viewport.getViewState().parallelScale / 4,
      6
    );

    viewport.setPan([10, 10]);

    expect(events.length).toBe(3 * perViewStateWrite);
  });
});

describe('getZoom, setZoom, getPan and setPan of a 3D viewport that shows nothing -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('gives zoom 1 and pan [0, 0], and keeps the camera for a zoom and a pan', function () {
    const viewport = createViewport(renderingEngine);
    const camera = viewport.getViewState();

    expect(viewport.getZoom()).toBe(1);
    expect(viewport.getPan()).toEqual([0, 0]);

    viewport.setZoom(2);
    viewport.setZoom(2, [10, 10]);
    viewport.setPan([5, 5]);

    expect(viewport.getViewState().parallelScale).toBe(camera.parallelScale);
    expectClose(viewport.getViewState().focalPoint, camera.focalPoint, 6);
    expectClose(viewport.getViewState().position, camera.position, 6);
    expect(viewport.getZoom()).toBe(1);
    expect(viewport.getPan()).toEqual([0, 0]);
  });
});
