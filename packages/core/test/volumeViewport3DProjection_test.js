import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache, viewportProjection } =
  cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();
const WIDTH = 400;
const HEIGHT = 300;
const CENTRE = [WIDTH / 2, HEIGHT / 2];

/** Makes a direct next 3D viewport of 400 by 300 pixels. */
function createViewport(renderingEngine, options = {}) {
  testUtils.createViewports(renderingEngine, {
    viewportId: 'next3D',
    viewportType: ViewportType.VOLUME_3D,
    orientation: OrientationAxis.AXIAL,
    width: WIDTH,
    height: HEIGHT,
    useEnableElement: true,
    ...options,
  });

  return renderingEngine.getViewport('next3D');
}

/**
 * Makes a volume of the fake volume loader, 40 columns, 30 rows and 12
 * slices 2 mm apart, and shows it on the viewport.
 */
async function showVolume(viewport) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    id: 'projection3D',
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 2,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  cornerstone3D.displaySetRegistry.add('projection3D', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId: 'projection3D',
  });
  viewport.resetViewState();
}

/** The zoom and the pan of the viewport from the projection service. */
function zoomPanOf(viewport) {
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

/** The checks of the zoom and the pan that hold for every camera. */
function checkZoomAndPan(viewport) {
  viewport.resetViewState();

  const fit = viewport.getViewState();
  const object = objectAtFocalPoint(viewport);
  const sizeAtFit = canvasDistance(viewport, ...object);

  expect(zoomPanOf(viewport).zoom).toBeCloseTo(1, 6);
  expectClose(zoomPanOf(viewport).pan, [0, 0], 4);
  expectClose(viewport.worldToCanvas(fit.focalPoint), CENTRE, 1);

  present(viewport, { zoom: 2 });

  expect(zoomPanOf(viewport).zoom).toBeCloseTo(2, 6);
  expectClose(zoomPanOf(viewport).pan, [0, 0], 4);
  expect(canvasDistance(viewport, ...object)).toBeCloseTo(2 * sizeAtFit, 1);
  expectClose(viewport.worldToCanvas(fit.focalPoint), CENTRE, 1);

  present(viewport, { pan: [20, -10] });

  expect(zoomPanOf(viewport).zoom).toBeCloseTo(2, 6);
  expectClose(zoomPanOf(viewport).pan, [20, -10], 4);
  expectClose(
    viewport.worldToCanvas(fit.focalPoint),
    [CENTRE[0] + 40, CENTRE[1] - 20],
    1
  );

  present(viewport, { zoom: 1 });

  expectClose(zoomPanOf(viewport).pan, [20, -10], 4);
  expectClose(
    viewport.worldToCanvas(fit.focalPoint),
    [CENTRE[0] + 20, CENTRE[1] - 10],
    1
  );
  expect(canvasDistance(viewport, ...object)).toBeCloseTo(sizeAtFit, 1);

  present(viewport, { zoom: 0.5, pan: [-30, 12] });

  expect(zoomPanOf(viewport).zoom).toBeCloseTo(0.5, 6);
  expectClose(zoomPanOf(viewport).pan, [-30, 12], 4);
  expectClose(
    viewport.worldToCanvas(fit.focalPoint),
    [CENTRE[0] - 15, CENTRE[1] + 6],
    1
  );

  viewport.resetViewState();

  expect(zoomPanOf(viewport).zoom).toBeCloseTo(1, 6);
  expectClose(zoomPanOf(viewport).pan, [0, 0], 4);
}

describe('Zoom and pan of a direct next 3D viewport through viewportProjection -- ', () => {
  let renderingEngine;
  let viewport;

  beforeEach(async function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });

    renderingEngine = testEnv.renderingEngine;
    viewport = createViewport(renderingEngine);
    await showVolume(viewport);
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('gives zoom 1 and pan [0, 0] for the fit, doubles a known object at zoom 2 and moves a world point by the pan', function () {
    checkZoomAndPan(viewport);
  });

  it('does the same after a rotation of the camera', function () {
    viewport.setViewReference({
      viewPlaneNormal: [0.6, 0, 0.8],
      viewUp: [0, 1, 0],
    });

    checkZoomAndPan(viewport);

    viewport.setViewReference({
      viewPlaneNormal: [0, -1, 0],
      viewUp: [0, 0, 1],
    });

    checkZoomAndPan(viewport);
  });

  it('does the same with a perspective camera, where the zoom moves the camera towards its focal point', function () {
    viewport.setViewState({ parallelProjection: false });

    checkZoomAndPan(viewport);

    viewport.resetViewState();

    const fit = viewport.getViewState();
    const distanceOf = ({ position, focalPoint }) =>
      Math.hypot(...position.map((value, axis) => value - focalPoint[axis]));

    present(viewport, { zoom: 4 });

    const zoomed = viewport.getViewState();

    expect(zoomed.parallelProjection).toBe(false);
    expect(distanceOf(zoomed)).toBeCloseTo(distanceOf(fit) / 4, 3);
    expectClose(zoomed.focalPoint, fit.focalPoint, 4);
    expect(zoomed.viewAngle).toBe(fit.viewAngle);
    expect(zoomed.parallelScale).toBeCloseTo(fit.parallelScale, 6);
  });

  it('changes only the parallel scale for a zoom of a parallel camera', function () {
    const fit = viewport.getViewState();

    present(viewport, { zoom: 2.5 });

    const zoomed = viewport.getViewState();

    expect(zoomed.parallelScale).toBeCloseTo(fit.parallelScale / 2.5, 6);
    expectClose(zoomed.focalPoint, fit.focalPoint, 6);
    expectClose(zoomed.position, fit.position, 6);
  });

  it('keeps the world point of the anchor canvas point under it for a zoom', function () {
    const anchorCanvas = [310, 90];
    const underAnchor = viewport.canvasToWorld(anchorCanvas);

    present(viewport, { zoom: 3 }, { anchorCanvas });

    expect(zoomPanOf(viewport).zoom).toBeCloseTo(3, 6);
    expectClose(viewport.worldToCanvas(underAnchor), anchorCanvas, 1);
  });

  it('does not move the viewport in withFraming, and applies only the camera of a patch with a camera', function () {
    const fit = viewport.getViewState();
    const next = viewportProjection.withFraming(viewport, { zoom: 2 });

    expect(viewport.getViewState().parallelScale).toBe(fit.parallelScale);
    expect(next.parallelScale).toBeCloseTo(fit.parallelScale / 2, 6);
    expect('zoom' in next).toBe(false);
    expect('pan' in next).toBe(false);

    const presentation = viewportProjection.getFraming(viewport);

    expect(presentation.camera.parallelScale).toBe(fit.parallelScale);
    expect(presentation.zoom).toBeCloseTo(1, 6);

    present(viewport, { zoom: 2, pan: [10, 10] });
    present(viewport, presentation);

    expect(viewport.getViewState().parallelScale).toBeCloseTo(
      fit.parallelScale,
      6
    );
    expectClose(viewport.getViewState().focalPoint, fit.focalPoint, 6);
    expect(zoomPanOf(viewport).zoom).toBeCloseTo(1, 6);
  });

  it('keeps no zoom reference of its own: the zoom is against the fit after any camera change', function () {
    const fit = viewport.getViewState();

    viewport.setViewState({ parallelScale: fit.parallelScale / 4 });

    expect(zoomPanOf(viewport).zoom).toBeCloseTo(4, 6);

    viewport.resetViewState({ resetZoom: false });

    expect(zoomPanOf(viewport).zoom).toBeCloseTo(4, 6);
    expectClose(zoomPanOf(viewport).pan, [0, 0], 4);
  });
});

describe('Zoom and pan of an empty direct next 3D viewport through viewportProjection -- ', () => {
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

  it('gives no zoom and no pan, and keeps the camera for a zoom and a pan', function () {
    const viewport = createViewport(renderingEngine);
    const camera = viewport.getViewState();
    const presentation = viewportProjection.getFraming(viewport);
    const next = viewportProjection.withFraming(viewport, {
      zoom: 2,
      pan: [5, 5],
    });

    expect(presentation.zoom).toBeUndefined();
    expect(presentation.pan).toBeUndefined();
    expect(next.parallelScale).toBe(camera.parallelScale);
    expectClose(next.focalPoint, camera.focalPoint, 6);
  });
});
