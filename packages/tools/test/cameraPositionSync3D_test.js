import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  expectPointsClose,
  renderAndWait,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, Enums, displaySetRegistry } = cornerstone3D;
const { OrientationAxis, ViewportType, Events } = Enums;
const { synchronizers, SynchronizerManager } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'cameraPositionSync3D';

const AXES = { rowCosines: [1, 0, 0], columnCosines: [0, 1, 0] };

/**
 * Two volumes of one frame of reference of other extents, centres and
 * spacings, so that each 3D view of them has its own fit (row 307 of
 * `v6-open-issues.md`).
 */
const GRIDS = {
  fine: {
    id: 'sync3DFine',
    plane: { ...AXES, origin: [-32, -24, -20] },
    size: {
      columns: 64,
      rows: 48,
      slices: 20,
      columnSpacing: 1,
      rowSpacing: 1,
      sliceSpacing: 2,
    },
  },
  coarse: {
    id: 'sync3DCoarse',
    plane: { ...AXES, origin: [-40, -42, -27] },
    size: {
      columns: 16,
      rows: 18,
      slices: 12,
      columnSpacing: 5,
      rowSpacing: 5,
      sliceSpacing: 5,
    },
  },
};

/** The camera of a 3D viewport. */
function cameraOf(viewport) {
  return viewport.getViewState();
}

/** The camera of a planar viewport, from its resolved view. */
function planarCameraOf(viewport) {
  return viewport.getResolvedView().toICamera();
}

/** Half the world height of a 3D view at its focal point. */
function halfHeightOf(camera) {
  if (camera.parallelProjection !== false) {
    return camera.parallelScale;
  }

  const distance = Math.hypot(
    ...camera.position.map((value, axis) => value - camera.focalPoint[axis])
  );

  return distance * Math.tan((camera.viewAngle * Math.PI) / 360);
}

/** The part of a point off a plane through `origin` with this normal. */
function inPlane(point, origin, normal) {
  const offset = point.map((value, axis) => value - origin[axis]);
  const along = offset.reduce(
    (sum, value, axis) => sum + value * normal[axis],
    0
  );

  return offset.map((value, axis) => value - along * normal[axis]);
}

/** The series of a grid. */
function seriesOf(name) {
  const grid = GRIDS[name];

  return createSeries({ id: grid.id, plane: grid.plane, size: grid.size });
}

/** The elements that a test made, removed after it. */
const elements = [];

/**
 * Enables a 3D viewport of 400 by 300 pixels with the orientation and the
 * projection given.
 */
function enable3D(
  renderingEngine,
  viewportId,
  { orientation = OrientationAxis.SAGITTAL, parallelProjection = true } = {}
) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  elements.push(element);
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: { orientation, parallelProjection, background: [1, 0, 1] },
  });

  return renderingEngine.getViewport(viewportId);
}

/**
 * Mounts the volume of a series on a 3D viewport, as an application mounts
 * a display set, and waits for its first frame.
 */
async function mount3D(viewport, series) {
  const displaySetId = `volume3D:${viewport.id}`;

  displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({ displaySetId });
  await renderAndWait(viewport);

  return viewport;
}

/** A 3D viewport, enabled and showing the volume of a series. */
function show3D(renderingEngine, viewportId, series, options) {
  return mount3D(enable3D(renderingEngine, viewportId, options), series);
}

/** Mounts the volume of a series sagittally on a planar viewport. */
async function showPlanar(renderingEngine, viewportId, series) {
  const viewport = createNextViewport(renderingEngine, viewportId);
  const displaySetId = `volume:${viewportId}`;

  displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { mode: 'volume', orientation: OrientationAxis.SAGITTAL },
  });
  await renderAndWait(viewport);

  return viewport;
}

/** Puts viewports in one camera position synchronizer, in the order given. */
function synchronize(viewports) {
  const synchronizer =
    synchronizers.createCameraPositionSynchronizer(synchronizerId);

  viewports.forEach((viewport) =>
    synchronizer.add({ renderingEngineId, viewportId: viewport.id })
  );

  return synchronizer;
}

/**
 * Counts the CAMERA_MODIFIED events of viewports from now on. `counts()`
 * gives them by viewport id, `stop()` removes the listeners.
 */
function countCameraEvents(viewports) {
  const counts = Object.fromEntries(viewports.map(({ id }) => [id, 0]));
  const listeners = viewports.map((viewport) => {
    const listener = () => {
      counts[viewport.id] += 1;
    };

    viewport.element.addEventListener(Events.CAMERA_MODIFIED, listener);

    return () =>
      viewport.element.removeEventListener(Events.CAMERA_MODIFIED, listener);
  });

  return {
    counts: () => ({ ...counts }),
    stop: () => listeners.forEach((remove) => remove()),
  };
}

/** Renders every viewport once and waits for their frames. */
function renderAll(viewports) {
  return Promise.all(viewports.map((viewport) => renderAndWait(viewport)));
}

/**
 * Changes the camera of `source` with `change`, and expects one camera event
 * of each viewport of the group: the change of the source, one write of each
 * target, nothing back to the source.
 */
async function changeOnce(source, viewports, change) {
  const events = countCameraEvents(viewports);

  change(source);
  await renderAll(viewports);
  events.stop();

  expect(events.counts()).toEqual(
    Object.fromEntries(viewports.map(({ id }) => [id, 1]))
  );
}

/**
 * Expects two 3D viewports to have one camera, as the 5.18.3 camera copy
 * gave: the same direction, view up, focal point and position, and the same
 * world height at the focal point.
 */
function expectSame3DCamera(viewport, other) {
  const camera = cameraOf(viewport);
  const otherCamera = cameraOf(other);

  expectPointsClose(camera.viewPlaneNormal, otherCamera.viewPlaneNormal, 6);
  expectPointsClose(camera.viewUp, otherCamera.viewUp, 6);
  expectPointsClose(camera.focalPoint, otherCamera.focalPoint, 4);
  expectPointsClose(camera.position, otherCamera.position, 3);
  expect(halfHeightOf(camera)).toBeCloseTo(halfHeightOf(otherCamera), 4);
}

/** A camera of a 3D view turned about the y axis by `degrees`. */
function turnedAboutY(viewport, degrees) {
  const camera = cameraOf(viewport);
  const angle = (degrees * Math.PI) / 180;
  const [x, , z] = camera.viewPlaneNormal;
  const normal = [
    x * Math.cos(angle) + z * Math.sin(angle),
    camera.viewPlaneNormal[1],
    -x * Math.sin(angle) + z * Math.cos(angle),
  ];
  const distance = Math.hypot(
    ...camera.position.map((value, axis) => value - camera.focalPoint[axis])
  );

  return {
    viewPlaneNormal: normal,
    viewUp: camera.viewUp,
    position: camera.focalPoint.map(
      (value, axis) => value + normal[axis] * distance
    ),
  };
}

describe('The camera position synchronizer with 3D viewports (row 307) -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    SynchronizerManager.destroySynchronizer(synchronizerId);
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    displaySetRegistry.clear?.();
    elements.splice(0).forEach((element) => element.remove());
  });

  it('gives two parallel 3D views of volumes of other extents one camera at a zoom, a pan and a turn of either, with one write of the other and no echo', async function () {
    const fine = await show3D(
      renderingEngine,
      'fine3D',
      await seriesOf('fine')
    );
    const coarse = await show3D(
      renderingEngine,
      'coarse3D',
      await seriesOf('coarse')
    );
    const viewports = [fine, coarse];

    expect(cameraOf(fine).parallelScale).not.toBeCloseTo(
      cameraOf(coarse).parallelScale,
      2
    );

    synchronize(viewports);

    await changeOnce(coarse, viewports, (viewport) =>
      viewport.setZoom(viewport.getZoom() * 1.5)
    );
    expectSame3DCamera(fine, coarse);
    expect(cameraOf(fine).parallelScale).toBeCloseTo(
      cameraOf(coarse).parallelScale,
      6
    );

    await changeOnce(coarse, viewports, (viewport) =>
      viewport.setPan([20, -10])
    );
    expectSame3DCamera(fine, coarse);

    await changeOnce(coarse, viewports, (viewport) =>
      viewport.setViewState(turnedAboutY(viewport, 30))
    );
    expectSame3DCamera(fine, coarse);

    await changeOnce(fine, viewports, (viewport) =>
      viewport.setZoom(viewport.getZoom() / 1.25)
    );
    expectSame3DCamera(coarse, fine);
  });

  it('gives two perspective 3D views one camera: the same position, focal point and view angle', async function () {
    const fine = await show3D(
      renderingEngine,
      'fine3D',
      await seriesOf('fine'),
      {
        parallelProjection: false,
      }
    );
    const coarse = await show3D(
      renderingEngine,
      'coarse3D',
      await seriesOf('coarse'),
      { parallelProjection: false }
    );
    const viewports = [fine, coarse];

    synchronize(viewports);

    await changeOnce(coarse, viewports, (viewport) =>
      viewport.setZoom(viewport.getZoom() * 1.5)
    );
    expectSame3DCamera(fine, coarse);
    expect(cameraOf(fine).viewAngle).toBeCloseTo(cameraOf(coarse).viewAngle, 6);

    await changeOnce(fine, viewports, (viewport) =>
      viewport.setViewState(turnedAboutY(viewport, -20))
    );
    expectSame3DCamera(coarse, fine);
  });

  it('writes no pane of the group at the mount of a 3D view that joins it, and gives it the camera of the group at the next change', async function () {
    const fine = await show3D(
      renderingEngine,
      'fine3D',
      await seriesOf('fine')
    );
    const synchronizer = synchronize([fine]);

    fine.setZoom(2);
    fine.setPan([15, 8]);
    await renderAll([fine]);

    const fineCamera = cameraOf(fine);
    const coarseSeries = await seriesOf('coarse');
    const coarse = enable3D(renderingEngine, 'coarse3D');

    synchronizer.add({ renderingEngineId, viewportId: coarse.id });

    const events = countCameraEvents([fine]);

    await mount3D(coarse, coarseSeries);
    await renderAll([fine, coarse]);
    events.stop();

    expect(events.counts()).toEqual({ [fine.id]: 0 });
    expectPointsClose(cameraOf(fine).focalPoint, fineCamera.focalPoint, 6);
    expect(cameraOf(fine).parallelScale).toBeCloseTo(
      fineCamera.parallelScale,
      6
    );

    await changeOnce(fine, [fine, coarse], (viewport) =>
      viewport.setPan([10, 4])
    );
    expectSame3DCamera(coarse, fine);
  });

  it('gives a 3D view in a group with a planar view the plane, the centre and the scale of the planar view, and no slice', async function () {
    const planar = await showPlanar(
      renderingEngine,
      'finePlanar',
      await seriesOf('fine')
    );
    const volume3D = await show3D(
      renderingEngine,
      'coarse3D',
      await seriesOf('coarse'),
      { orientation: OrientationAxis.CORONAL }
    );
    const viewports = [planar, volume3D];

    synchronize(viewports);

    await changeOnce(planar, viewports, (viewport) => {
      viewport.setZoom(viewport.getZoom() * 1.5);
    });
    await changeOnce(planar, viewports, (viewport) => {
      viewport.setPan([20, -10]);
    });

    const planarCamera = planarCameraOf(planar);
    let camera = cameraOf(volume3D);

    expectPointsClose(camera.viewPlaneNormal, planarCamera.viewPlaneNormal, 6);
    expectPointsClose(camera.viewUp, planarCamera.viewUp, 6);
    expect(camera.parallelScale).toBeCloseTo(planarCamera.parallelScale, 6);
    expectPointsClose(
      inPlane(
        camera.focalPoint,
        planarCamera.focalPoint,
        camera.viewPlaneNormal
      ),
      [0, 0, 0],
      4
    );

    const depth = camera.focalPoint[0];
    const sliceIndex = planar.getSliceIndex();
    let events = countCameraEvents(viewports);

    await planar.scroll(3);
    await renderAll(viewports);
    events.stop();

    expect(planar.getSliceIndex()).toBe(sliceIndex + 3);
    expect(events.counts()).toEqual({ [planar.id]: 1, [volume3D.id]: 0 });
    expect(cameraOf(volume3D).focalPoint[0]).toBeCloseTo(depth, 6);

    events = countCameraEvents(viewports);
    volume3D.setZoom(volume3D.getZoom() * 1.25);
    await renderAll(viewports);
    events.stop();

    expect(events.counts()).toEqual({ [planar.id]: 1, [volume3D.id]: 1 });
    expect(planar.getSliceIndex()).toBe(sliceIndex + 3);
    camera = cameraOf(volume3D);
    expect(planarCameraOf(planar).parallelScale).toBeCloseTo(
      camera.parallelScale,
      6
    );
    expectPointsClose(
      inPlane(
        planarCameraOf(planar).focalPoint,
        camera.focalPoint,
        camera.viewPlaneNormal
      ),
      [0, 0, 0],
      4
    );
  });
});
