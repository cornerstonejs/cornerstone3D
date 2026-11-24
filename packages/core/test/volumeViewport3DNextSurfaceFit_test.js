import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, utilities, cache, geometryLoader } = cornerstone3D;
const { ViewportType, OrientationAxis, Events, GeometryType } = Enums;

const renderingEngineId = utilities.uuidv4();
const geometryId = 'surfaceFitBox';

/**
 * The legacy 3D viewport of commit 58914567b, 400 by 300 pixels, sagittal,
 * with the red box of these tests as its only actor, in parallel and in
 * perspective: the camera that `setActors` gave at the mount, the same that
 * `resetCamera` gave after an `addActor`, and the red pixels of its picture
 * (red above 150, green and blue below 80).
 * The legacy 3D viewport kept a view angle of 90 from the moment it was made.
 */
const LEGACY_SURFACE_FIT = {
  viewAngle: 90,
  parallelScale: 7.5,
  distance: 187.0829,
  focalPoint: [15, 10, 5],
  redPixels: { parallel: 80000, perspective: 144 },
};

/** Makes a direct next 3D viewport of 400 by 300 pixels, sagittal. */
function createNextViewport(renderingEngine, parallelProjection) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId: 'surfaceFit',
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: {
      orientation: OrientationAxis.SAGITTAL,
      background: [1, 0, 1],
      parallelProjection,
    },
  });

  return renderingEngine.getViewport('surfaceFit');
}

/**
 * Makes and shows a red box from [0, 0, 0] to [30, 20, 10] as a surface
 * display set: its two faces across the x axis, which a sagittal camera
 * sees.
 */
async function showSurface(viewport) {
  const points = [];

  for (const x of [0, 30]) {
    points.push(x, 0, 0, x, 20, 0, x, 20, 10, x, 0, 10);
  }

  await geometryLoader.createAndCacheGeometry(geometryId, {
    type: GeometryType.SURFACE,
    geometryData: {
      id: geometryId,
      color: [255, 0, 0],
      frameOfReferenceUID: 'surfaceFitFrameOfReference',
      segmentIndex: 1,
      points,
      polys: [4, 0, 1, 2, 3, 4, 4, 5, 6, 7],
    },
  });
  await viewport.setDisplaySets({
    displaySetId: geometryId,
    options: { renderMode: 'vtkGeometry3d' },
  });
}

/** The fields of the vtk.js camera that a fit sets. */
function fitOf(viewport) {
  const vtkCamera = viewport.getRenderer().getActiveCamera();
  const position = vtkCamera.getPosition();
  const focalPoint = vtkCamera.getFocalPoint();

  return {
    viewAngle: vtkCamera.getViewAngle(),
    parallelScale: vtkCamera.getParallelScale(),
    distance: Math.hypot(
      ...position.map((value, axis) => value - focalPoint[axis])
    ),
    focalPoint,
  };
}

/** Renders the viewport and counts the red pixels of its picture. */
async function redPixelsOf(viewport) {
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
  let red = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    red +=
      data[offset] > 150 && data[offset + 1] < 80 && data[offset + 2] < 80
        ? 1
        : 0;
  }

  return red;
}

/** Expects the fit of a camera to be the legacy fit. */
function expectLegacyFit(fit, context) {
  expect(fit.viewAngle).withContext(context).toBe(LEGACY_SURFACE_FIT.viewAngle);
  expect(fit.parallelScale)
    .withContext(context)
    .toBeCloseTo(LEGACY_SURFACE_FIT.parallelScale, 3);
  expect(fit.distance)
    .withContext(context)
    .toBeCloseTo(LEGACY_SURFACE_FIT.distance, 3);
  LEGACY_SURFACE_FIT.focalPoint.forEach((value, axis) =>
    expect(fit.focalPoint[axis]).withContext(context).toBeCloseTo(value, 3)
  );
}

/** Expects a count within 5 percent of the legacy count. */
function expectNearCount(actual, expected, context) {
  expect(Math.abs(actual - expected))
    .withContext(`${context}: ${actual} against ${expected}`)
    .toBeLessThanOrEqual(Math.max(2, expected * 0.05));
}

describe('The first fit of a surface on a direct next 3D viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
    }).renderingEngine;
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();

    if (cache.getGeometry(geometryId)) {
      cache.removeGeometryLoadObject(geometryId);
    }

    testUtils.cleanupTestEnvironment({ renderingEngineId, toolGroupIds: [] });
  });

  for (const parallelProjection of [true, false]) {
    const kind = parallelProjection ? 'parallel' : 'perspective';

    it(`fits a surface shown alone with the fit and the view angle of resetViewState, as the legacy setActors and resetCamera did, in ${kind}`, async function () {
      const viewport = createNextViewport(renderingEngine, parallelProjection);

      await showSurface(viewport);

      expectLegacyFit(fitOf(viewport), 'mount');
      expectNearCount(
        await redPixelsOf(viewport),
        LEGACY_SURFACE_FIT.redPixels[kind],
        'mount'
      );

      viewport.resetViewState();

      expectLegacyFit(fitOf(viewport), 'reset');
      expectNearCount(
        await redPixelsOf(viewport),
        LEGACY_SURFACE_FIT.redPixels[kind],
        'reset'
      );
    });
  }
});
