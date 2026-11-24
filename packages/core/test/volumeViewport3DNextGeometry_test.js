import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const {
  Enums,
  volumeLoader,
  geometryLoader,
  utilities,
  cache,
  viewportProjection,
} = cornerstone3D;
const { ViewportType, OrientationAxis, GeometryType } = Enums;

const renderingEngineId = utilities.uuidv4();
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;

/**
 * The camera of the legacy 3D viewport class of 5.x in the sagittal
 * orientation with one added actor and no volume, before a reset. The values
 * were read from that class before it was deleted.
 */
const LEGACY_ACTOR_ONLY_CAMERA = {
  viewUp: [0, 0, 1],
  focalPoint: [0, 0, 0],
  position: [17.32050807568877, 0, 0],
};

/**
 * What `resetCamera` of the legacy 3D viewport class of 5.x fitted from
 * `LEGACY_ACTOR_ONLY_CAMERA` for an added box actor from [-50, 10, 0] to
 * [150, 60, 300]. The values were read from that class before it was deleted.
 */
const LEGACY_ACTOR_ONLY_FIT = {
  parallelScale: 150,
  focalPoint: [50, 35, 150],
};

/**
 * What `resetCamera` of the legacy 3D viewport class of 5.x fitted with the
 * volume of the tests and an added box actor from [2, 2, 2] to [20, 15, 10]
 * inside it: the fit of the volume alone.
 */
const LEGACY_VOLUME_AND_ACTOR_FIT = {
  parallelScale: 15,
  focalPoint: [15, 19.5, 11],
};

/** Makes a direct next 3D viewport, sagittal, in the rendering engine. */
function createNextViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    orientation: OrientationAxis.SAGITTAL,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    useEnableElement: true,
    viewportId: 'next3D',
    viewportType: ViewportType.VOLUME_3D,
  });

  return renderingEngine.getViewport('next3D');
}

/**
 * Makes a volume of the fake volume loader, 40 columns, 30 rows and 12 slices
 * 2 mm apart, and shows it on the next viewport.
 */
async function showVolume(next) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    id: 'volumeURI',
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 2,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  cornerstone3D.displaySetRegistry.add('next3DVolume', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await next.setDisplaySets({
    displaySetId: 'next3DVolume',
    options: { renderMode: 'vtkVolume3d' },
  });
}

/**
 * The points and the polys of a box of two faces from `min` to `max`: eight
 * points, so that the bounds of the surface are the box.
 */
function createBoxSurfaceData(min, max) {
  const points = [];

  for (const z of [min[2], max[2]]) {
    points.push(min[0], min[1], z, max[0], min[1], z);
    points.push(max[0], max[1], z, min[0], max[1], z);
  }

  return {
    points,
    polys: [4, 0, 1, 2, 3, 4, 4, 5, 6, 7],
  };
}

/** Makes and caches a surface geometry of a box, in red. */
function createSurfaceGeometry(geometryId, min, max) {
  return geometryLoader.createAndCacheGeometry(geometryId, {
    type: GeometryType.SURFACE,
    geometryData: {
      id: geometryId,
      color: [255, 0, 0],
      frameOfReferenceUID: 'surfaceFrameOfReference',
      segmentIndex: 1,
      ...createBoxSurfaceData(min, max),
    },
  });
}

/** Takes a geometry out of the cache, which a purge of the cache keeps. */
function removeCachedGeometry(geometryId) {
  if (cache.getGeometry(geometryId)) {
    cache.removeGeometryLoadObject(geometryId);
  }
}

/** The actor entry of a geometry display set on a next viewport. */
function geometryEntryOf(viewport, geometryId) {
  return viewport
    .getActors()
    .find(({ referencedId }) => referencedId === geometryId);
}

/** The number of points of the poly data that the actor draws. */
function pointCountOf(actor) {
  return actor.getMapper().getInputData().getPoints().getNumberOfPoints();
}

/** Expects every corner of the box to be inside the canvas of the viewport. */
function expectBoxInsideCanvas(viewport, min, max) {
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const [canvasX, canvasY] = viewport.worldToCanvas([x, y, z]);

        expect(canvasX).toBeGreaterThanOrEqual(-0.01);
        expect(canvasX).toBeLessThanOrEqual(CANVAS_WIDTH + 0.01);
        expect(canvasY).toBeGreaterThanOrEqual(-0.01);
        expect(canvasY).toBeLessThanOrEqual(CANVAS_HEIGHT + 0.01);
      }
    }
  }
}

function expectPointsClose(actual, expected, precision = 4) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], precision);
  });
}

describe('Direct next 3D viewport, a geometry display set -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
  });

  afterEach(function () {
    cornerstone3D.displaySetRegistry.clear();
    removeCachedGeometry('surface1');
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('mounts a surface with addDisplaySet and takes it out of the scene with removeDisplaySet', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    createSurfaceGeometry('surface1', [0, 0, 0], [30, 20, 10]);
    await next.addDisplaySet('surface1', { renderMode: 'vtkGeometry3d' });

    const entry = geometryEntryOf(next, 'surface1');

    expect(
      next.getDisplaySets().map(({ displaySetId }) => displaySetId)
    ).toEqual(['next3DVolume', 'surface1']);
    expect(next.getCurrentMode()).toBe('volume3d');
    expect(next.getActors().length).toBe(2);
    expect(entry.representationUID).toBeUndefined();
    expect(entry.actor.getClassName()).toBe('vtkActor');
    expect(next.getRenderer().getActors()).toContain(entry.actor);
    expect(pointCountOf(entry.actor)).toBe(8);
    expect(entry.actor.getBounds()).toEqual([0, 30, 0, 20, 0, 10]);
    expect(entry.actor.getProperty().getColor()).toEqual([1, 0, 0]);

    next.removeDisplaySet('surface1');

    expect(geometryEntryOf(next, 'surface1')).toBeUndefined();
    expect(next.getActors().length).toBe(1);
    expect(next.getRenderer().getActors()).not.toContain(entry.actor);
    expect(next.getDisplaySetPresentation('surface1')).toBeUndefined();
  });

  it('gives the actor entry the representation UID of the reference of the registered display set', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    createSurfaceGeometry('surface1', [0, 0, 0], [30, 20, 10]);
    cornerstone3D.displaySetRegistry.add('surface1', {
      imageIds: [],
      geometryId: 'surface1',
      reference: {
        kind: 'segmentation',
        segmentationId: 'segmentation1',
        representationUID: 'segmentation1-Surface-1',
      },
    });
    await next.addDisplaySet('surface1', { role: 'overlay' });

    expect(geometryEntryOf(next, 'surface1').representationUID).toBe(
      'segmentation1-Surface-1'
    );
    expect(next.getActors()[0].representationUID).toBeUndefined();
  });

  it('mounts a geometry display set that is registered with a reference and no imageIds', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    createSurfaceGeometry('surface1', [0, 0, 0], [30, 20, 10]);
    cornerstone3D.displaySetRegistry.add('surfaceSet1', {
      geometryId: 'surface1',
      reference: {
        kind: 'segmentation',
        segmentationId: 'segmentation1',
        representationUID: 'segmentation1-Surface-1',
      },
    });
    await next.addDisplaySet('surfaceSet1', { role: 'overlay' });

    const entry = geometryEntryOf(next, 'surface1');

    expect(entry.representationUID).toBe('segmentation1-Surface-1');
    expect(pointCountOf(entry.actor)).toBe(8);
    expect(entry.actor.getBounds()).toEqual([0, 30, 0, 20, 0, 10]);
  });

  it('shows colour, opacity and visibility of the presentation of the display set', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    createSurfaceGeometry('surface1', [0, 0, 0], [30, 20, 10]);
    next.setDisplaySetPresentation('surface1', { color: [0, 0, 255] });
    await next.addDisplaySet('surface1', { renderMode: 'vtkGeometry3d' });

    const { actor } = geometryEntryOf(next, 'surface1');

    expect(actor.getProperty().getColor()).toEqual([0, 0, 1]);
    expect(actor.getVisibility()).toBe(true);
    expect(actor.getProperty().getOpacity()).toBe(1);

    next.setDisplaySetPresentation('surface1', {
      color: [0, 255, 0],
      opacity: 0.5,
      visible: false,
    });

    expect(actor.getProperty().getColor()).toEqual([0, 1, 0]);
    expect(actor.getProperty().getOpacity()).toBe(0.5);
    expect(actor.getVisibility()).toBe(false);
    expect(next.getDisplaySetPresentation('surface1')).toEqual({
      color: [0, 255, 0],
      opacity: 0.5,
      visible: false,
    });

    next.setDisplaySetPresentation('surface1', { visible: true });

    expect(actor.getVisibility()).toBe(true);
    expect(actor.getProperty().getColor()).toEqual([0, 1, 0]);
  });

  it('draws new points and polys of the surface at the next render, with the same actor', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);

    const surface = createSurfaceGeometry(
      'surface1',
      [0, 0, 0],
      [30, 20, 10]
    ).data;

    await next.addDisplaySet('surface1', { renderMode: 'vtkGeometry3d' });

    const { actor, uid } = geometryEntryOf(next, 'surface1');
    const polyData = actor.getMapper().getInputData();

    next.render();

    expect(actor.getMapper().getInputData()).toBe(polyData);

    surface.points = [0, 0, 0, 30, 0, 0, 30, 20, 15];
    surface.polys = [3, 0, 1, 2];
    next.render();

    expect(geometryEntryOf(next, 'surface1').actor).toBe(actor);
    expect(geometryEntryOf(next, 'surface1').uid).toBe(uid);
    expect(pointCountOf(actor)).toBe(3);
    expect(actor.getBounds()).toEqual([0, 30, 0, 20, 0, 15]);
    expect(
      Array.from(actor.getMapper().getInputData().getPolys().getData())
    ).toEqual([3, 0, 1, 2]);
  });

  it('draws a face appended in place to the points and the polys of the surface at the next render, with the same actor', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);

    const surface = createSurfaceGeometry(
      'surface1',
      [0, 0, 0],
      [30, 20, 10]
    ).data;

    await next.addDisplaySet('surface1', { renderMode: 'vtkGeometry3d' });

    const { actor, uid } = geometryEntryOf(next, 'surface1');
    const { points, polys } = surface;

    next.render();
    points.push(0, 0, 0, 30, 0, 0, 30, 20, 15);
    polys.push(3, 8, 9, 10);
    next.render();

    expect(surface.points).toBe(points);
    expect(surface.polys).toBe(polys);
    expect(geometryEntryOf(next, 'surface1').actor).toBe(actor);
    expect(geometryEntryOf(next, 'surface1').uid).toBe(uid);
    expect(pointCountOf(actor)).toBe(11);
    expect(actor.getBounds()).toEqual([0, 30, 0, 20, 0, 15]);
    expect(
      Array.from(actor.getMapper().getInputData().getPolys().getData())
    ).toEqual([4, 0, 1, 2, 3, 4, 4, 5, 6, 7, 3, 8, 9, 10]);
  });

  it('draws a surface that was emptied as nothing, and fits the volume then', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    next.resetViewState();

    const volumeFit = next.getViewState();
    const surface = createSurfaceGeometry(
      'surface1',
      [-100, -80, -60],
      [200, 150, 120]
    ).data;

    await next.addDisplaySet('surface1', { renderMode: 'vtkGeometry3d' });

    const { actor } = geometryEntryOf(next, 'surface1');

    surface.points = [];
    surface.polys = [];
    next.render();
    renderingEngine.render();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(geometryEntryOf(next, 'surface1').actor).toBe(actor);
    expect(pointCountOf(actor)).toBe(0);
    expect(() => next.resetViewState()).not.toThrow();
    expect(next.getViewState().parallelScale).toBeCloseTo(
      volumeFit.parallelScale,
      6
    );
    expectPointsClose(next.getViewState().focalPoint, volumeFit.focalPoint);
  });

  it('fits a surface that is mounted alone on resetViewState, as the legacy viewport fits an added actor', async function () {
    const next = createNextViewport(renderingEngine);
    const min = [-50, 10, 0];
    const max = [150, 60, 300];

    createSurfaceGeometry('surface1', min, max);
    await next.addDisplaySet('surface1', { renderMode: 'vtkGeometry3d' });

    const { viewUp, focalPoint, position } = LEGACY_ACTOR_ONLY_CAMERA;

    next.setViewState({ viewUp, focalPoint, position });
    next.setViewState({ parallelScale: 5 });
    next.resetViewState();

    const nextCamera = next.getViewState();
    const legacyCamera = LEGACY_ACTOR_ONLY_FIT;

    expect(nextCamera.parallelScale).toBeCloseTo(legacyCamera.parallelScale, 4);
    expectPointsClose(nextCamera.focalPoint, legacyCamera.focalPoint);
    expectPointsClose(nextCamera.focalPoint, [50, 35, 150]);
    expectBoxInsideCanvas(next, min, max);
    expect(viewportProjection.getPresentation(next).zoom).toBeCloseTo(1, 6);
  });

  it('keeps the fit of the volume for a surface inside the volume, as the legacy viewport', async function () {
    const next = createNextViewport(renderingEngine);

    await showVolume(next);
    createSurfaceGeometry('surface1', [2, 2, 2], [20, 15, 10]);
    await next.addDisplaySet('surface1', { renderMode: 'vtkGeometry3d' });
    next.resetViewState();

    const nextCamera = next.getViewState();
    const legacyCamera = LEGACY_VOLUME_AND_ACTOR_FIT;

    expect(nextCamera.parallelScale).toBeCloseTo(legacyCamera.parallelScale, 4);
    expectPointsClose(nextCamera.focalPoint, legacyCamera.focalPoint);
  });

  it('fits a surface that reaches outside the volume on resetViewState, and leaves a hidden one out', async function () {
    const next = createNextViewport(renderingEngine);
    const min = [-100, -80, -60];
    const max = [200, 150, 120];

    await showVolume(next);
    next.resetViewState();

    const volumeFit = next.getViewState();

    createSurfaceGeometry('surface1', min, max);
    await next.addDisplaySet('surface1', { renderMode: 'vtkGeometry3d' });
    next.resetViewState();

    expectBoxInsideCanvas(next, min, max);
    expectPointsClose(next.getViewState().focalPoint, [50, 35, 30]);
    expect(next.getViewState().parallelScale).toBeGreaterThan(
      volumeFit.parallelScale
    );
    expect(viewportProjection.getPresentation(next).zoom).toBeCloseTo(1, 6);
    expectPointsClose(viewportProjection.getPresentation(next).pan, [0, 0]);

    next.setDisplaySetPresentation('surface1', { visible: false });
    next.resetViewState();

    expect(next.getViewState().parallelScale).toBeCloseTo(
      volumeFit.parallelScale,
      6
    );
    expectPointsClose(next.getViewState().focalPoint, volumeFit.focalPoint);
  });
});
