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
const { OrientationAxis, Events } = Enums;
const { synchronizers, SynchronizerManager } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'cameraPositionSyncGrids';

const AXES = { rowCosines: [1, 0, 0], columnCosines: [0, 1, 0] };

/**
 * Three volumes of one frame of reference, viewed sagittally: the slices of a
 * view are the columns of a volume, so the slice step of a view is the
 * column spacing (1, 2.5 and 5 mm, as a CT, a coarser series and a PET), and
 * the extents and the centres of the three volumes in the plane of the view
 * differ, so each view has its own fit.
 */
const GRIDS = {
  fine: {
    id: 'gridFine',
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
  mid: {
    id: 'gridMid',
    plane: { ...AXES, origin: [-36, -30, -23] },
    size: {
      columns: 30,
      rows: 26,
      slices: 16,
      columnSpacing: 2.5,
      rowSpacing: 2.5,
      sliceSpacing: 3,
    },
  },
  coarse: {
    id: 'gridCoarse',
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

/** The camera of a viewport, from its resolved view. */
function cameraOf(viewport) {
  return viewport.getResolvedView().toICamera();
}

/** The position of a view along the sagittal normal: the x of its camera. */
function positionOf(viewport) {
  return cameraOf(viewport).focalPoint[0];
}

/** The x of the centre of the slice that a view draws. */
function drawnSliceOf(viewport) {
  return viewport.getViewReference().cameraFocalPoint[0];
}

/** The x of the slice of a grid nearest to a position. */
function nearestSliceOf(grid, x) {
  const { origin } = grid.plane;
  const step = grid.size.columnSpacing;
  const index = Math.min(
    Math.max(Math.round((x - origin[0]) / step), 0),
    grid.size.columns - 1
  );

  return origin[0] + index * step;
}

/** The view slice index of a viewport whose slice centre is at `x`. */
function sliceIndexAt(viewport, x) {
  let best = 0;

  for (let index = 0; index < viewport.getNumberOfSlices(); index++) {
    const centre = viewport.getViewReference({ sliceIndex: index })
      .cameraFocalPoint[0];
    const bestCentre = viewport.getViewReference({ sliceIndex: best })
      .cameraFocalPoint[0];

    if (Math.abs(centre - x) < Math.abs(bestCentre - x)) {
      best = index;
    }
  }

  return best;
}

/** The point at the centre of the canvas, without its x (the normal). */
function inPlaneCentreOf(viewport) {
  const [, y, z] = cameraOf(viewport).focalPoint;

  return [y, z];
}

/**
 * Mounts the volume of a series sagittally on a viewport, as an application
 * mounts a display set, and waits for its first frame. The view opens on
 * its default slice.
 */
async function mountSagittal(viewport, series) {
  const displaySetId = `volume:${viewport.id}`;

  displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { mode: 'volume', orientation: OrientationAxis.SAGITTAL },
  });
  await renderAndWait(viewport);
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
 * Viewports of the named grids, each mounted sagittally, then put in one
 * camera position synchronizer in the order given.
 */
async function showSynchronized(renderingEngine, names) {
  const panes = {};

  for (const name of names) {
    const grid = GRIDS[name];
    const series = await createSeries({
      id: grid.id,
      plane: grid.plane,
      size: grid.size,
    });
    const viewport = createNextViewport(renderingEngine, `${name}Pane`);

    await mountSagittal(viewport, series);
    panes[name] = { viewport, series, grid };
  }

  const synchronizer =
    synchronizers.createCameraPositionSynchronizer(synchronizerId);

  names.forEach((name) =>
    synchronizer.add({ renderingEngineId, viewportId: panes[name].viewport.id })
  );

  return { panes, synchronizer };
}

/** Jumps a viewport to its slice whose centre is at `x`. */
async function jumpToX(viewport, x) {
  await utilities.jumpToSlice(viewport.element, {
    imageIndex: sliceIndexAt(viewport, x),
  });
  await renderAndWait(viewport);
}

/**
 * Expects every viewport of a group to show the same parallel scale and the
 * same world point at the centre of its canvas, as the 5.x camera copy gave.
 */
function expectSameScaleAndCentre(viewports) {
  const [first, ...others] = viewports;

  others.forEach((viewport) => {
    expect(cameraOf(viewport).parallelScale).toBeCloseTo(
      cameraOf(first).parallelScale,
      6
    );
    expectPointsClose(inPlaneCentreOf(viewport), inPlaneCentreOf(first), 4);
  });
}

describe('The camera position synchronizer between volumes of other grids and extents (OHIF M85, M86) -- ', () => {
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
  });

  it('keeps the slice of the fine pane when the coarse pane zooms, and gives both one parallel scale', async function () {
    const { panes } = await showSynchronized(renderingEngine, [
      'fine',
      'coarse',
    ]);
    const fine = panes.fine.viewport;
    const coarse = panes.coarse.viewport;

    await jumpToX(fine, 2);
    await renderAll([coarse]);

    expect(positionOf(fine)).toBeCloseTo(2, 6);
    expect(drawnSliceOf(coarse)).toBeCloseTo(0, 6);

    const fineSlice = fine.getSliceIndex();

    coarse.setZoom(coarse.getZoom() * 1.5);
    await renderAll([fine, coarse]);

    expect(fine.getSliceIndex()).toBe(fineSlice);
    expect(positionOf(fine)).toBeCloseTo(2, 6);
    expect(drawnSliceOf(fine)).toBeCloseTo(2, 6);
    expectSameScaleAndCentre([coarse, fine]);
  });

  it('keeps the slice of the fine pane through a pan, a rotation and a resize of the coarse pane', async function () {
    const { panes } = await showSynchronized(renderingEngine, [
      'fine',
      'coarse',
    ]);
    const fine = panes.fine.viewport;
    const coarse = panes.coarse.viewport;

    await jumpToX(fine, -3);
    await renderAll([coarse]);

    const fineSlice = fine.getSliceIndex();

    coarse.setPan([20, -10]);
    await renderAll([fine, coarse]);

    expect(fine.getSliceIndex()).toBe(fineSlice);
    expect(positionOf(fine)).toBeCloseTo(-3, 6);
    expectSameScaleAndCentre([coarse, fine]);

    coarse.setViewState({ rotation: 30 });
    await renderAll([fine, coarse]);

    expect(fine.getSliceIndex()).toBe(fineSlice);
    expectPointsClose(cameraOf(fine).viewUp, cameraOf(coarse).viewUp, 6);
    expectSameScaleAndCentre([coarse, fine]);

    const events = countCameraEvents([fine, coarse]);

    coarse.element.style.width = '300px';
    coarse.element.style.height = '200px';
    renderingEngine.resize(true, true);
    await renderAll([fine, coarse]);
    events.stop();

    expect(fine.getSliceIndex()).toBe(fineSlice);
    expect(positionOf(fine)).toBeCloseTo(-3, 6);
    expectSameScaleAndCentre([coarse, fine]);
    expect(events.counts()[fine.id]).toBe(0);
  });

  it('moves each pane to the slice of its own grid nearest to the position of a pane that scrolls, once, and never back to the source', async function () {
    const { panes } = await showSynchronized(renderingEngine, [
      'fine',
      'mid',
      'coarse',
    ]);
    const viewports = ['fine', 'mid', 'coarse'].map(
      (name) => panes[name].viewport
    );
    const [fine, mid, coarse] = viewports;

    await jumpToX(fine, 0);
    await renderAll(viewports);

    let events = countCameraEvents(viewports);

    await jumpToX(fine, 3);
    await renderAll(viewports);
    events.stop();

    expect(positionOf(fine)).toBeCloseTo(3, 6);
    expect(drawnSliceOf(mid)).toBeCloseTo(nearestSliceOf(GRIDS.mid, 3), 6);
    expect(drawnSliceOf(coarse)).toBeCloseTo(
      nearestSliceOf(GRIDS.coarse, 3),
      6
    );
    expect(events.counts()).toEqual({
      [fine.id]: 1,
      [mid.id]: 1,
      [coarse.id]: 1,
    });

    events = countCameraEvents(viewports);
    await coarse.scroll(1);
    await renderAll(viewports);
    events.stop();

    const coarseX = drawnSliceOf(coarse);

    expect(Math.abs(coarseX - nearestSliceOf(GRIDS.coarse, 3))).toBeCloseTo(
      5,
      6
    );
    expect(positionOf(coarse)).toBeCloseTo(coarseX, 6);
    expect(drawnSliceOf(fine)).toBeCloseTo(
      nearestSliceOf(GRIDS.fine, coarseX),
      6
    );
    expect(drawnSliceOf(mid)).toBeCloseTo(
      nearestSliceOf(GRIDS.mid, coarseX),
      6
    );
    expect(events.counts()).toEqual({
      [fine.id]: 1,
      [mid.id]: 1,
      [coarse.id]: 1,
    });

    events = countCameraEvents(viewports);
    await mid.scroll(1);
    await renderAll(viewports);
    events.stop();

    const midX = drawnSliceOf(mid);

    expect(drawnSliceOf(fine)).toBeCloseTo(nearestSliceOf(GRIDS.fine, midX), 6);
    expect(drawnSliceOf(coarse)).toBeCloseTo(
      nearestSliceOf(GRIDS.coarse, midX),
      6
    );
    expect(events.counts()[mid.id]).toBe(1);
    expect(events.counts()[fine.id]).toBe(1);
    expect(events.counts()[coarse.id]).toBe(
      nearestSliceOf(GRIDS.coarse, midX) === coarseX ? 0 : 1
    );
    expectSameScaleAndCentre(viewports);
  });

  it('does not move the fine pane that drove the coarse panes when the coarse panes change after it (no echo)', async function () {
    const { panes } = await showSynchronized(renderingEngine, [
      'fine',
      'mid',
      'coarse',
    ]);
    const viewports = ['fine', 'mid', 'coarse'].map(
      (name) => panes[name].viewport
    );
    const [fine, mid, coarse] = viewports;

    await jumpToX(fine, 1);
    await renderAll(viewports);

    expect(drawnSliceOf(mid)).toBeCloseTo(nearestSliceOf(GRIDS.mid, 1), 6);
    expect(drawnSliceOf(coarse)).toBeCloseTo(
      nearestSliceOf(GRIDS.coarse, 1),
      6
    );

    const fineSlice = fine.getSliceIndex();
    const midSlice = mid.getSliceIndex();

    for (const viewport of [coarse, mid, coarse]) {
      const events = countCameraEvents(viewports);

      viewport.setZoom(viewport.getZoom() * 1.25);
      await renderAll(viewports);
      events.stop();

      expect(fine.getSliceIndex()).toBe(fineSlice);
      expect(mid.getSliceIndex()).toBe(midSlice);
      expect(positionOf(fine)).toBeCloseTo(1, 6);
      viewports.forEach((other) => {
        expect(events.counts()[other.id]).toBe(1);
      });
      expectSameScaleAndCentre(viewports);
    }

    const events = countCameraEvents(viewports);

    fine.setZoom(fine.getZoom() / 1.25);
    await renderAll(viewports);
    events.stop();

    expect(mid.getSliceIndex()).toBe(midSlice);
    expect(drawnSliceOf(coarse)).toBeCloseTo(
      nearestSliceOf(GRIDS.coarse, 1),
      6
    );
    viewports.forEach((other) => {
      expect(events.counts()[other.id]).toBe(1);
    });
  });

  it('keeps the slice of a fine pane through its own resize while a coarse pane of the group shows another point of its slice', async function () {
    const { panes } = await showSynchronized(renderingEngine, [
      'fine',
      'coarse',
    ]);
    const fine = panes.fine.viewport;
    const coarse = panes.coarse.viewport;

    await jumpToX(coarse, 5);
    await renderAll([fine, coarse]);
    await jumpToX(fine, 6);
    await renderAll([fine, coarse]);

    expect(positionOf(coarse)).toBeCloseTo(5, 6);

    const fineSlice = fine.getSliceIndex();
    const events = countCameraEvents([fine, coarse]);

    fine.element.style.width = '320px';
    fine.element.style.height = '260px';
    renderingEngine.resize(true, true);
    await renderAll([fine, coarse]);
    events.stop();

    expect(fine.getSliceIndex()).toBe(fineSlice);
    expect(positionOf(fine)).toBeCloseTo(6, 6);
    expect(events.counts()).toEqual({ [fine.id]: 1, [coarse.id]: 0 });
    expectSameScaleAndCentre([fine, coarse]);
  });

  it('gives a pane that joins the group at its mount the scale and the centre of the group, and moves no pane along its normal', async function () {
    const { panes, synchronizer } = await showSynchronized(renderingEngine, [
      'fine',
      'coarse',
    ]);
    const fine = panes.fine.viewport;
    const coarse = panes.coarse.viewport;

    await jumpToX(fine, 4);
    fine.setZoom(2);
    fine.setPan([15, 8]);
    await renderAll([fine, coarse]);

    const fineCamera = cameraOf(fine);
    const midSeries = await createSeries({
      id: GRIDS.mid.id,
      plane: GRIDS.mid.plane,
      size: GRIDS.mid.size,
    });
    const mid = createNextViewport(renderingEngine, 'midPane');

    synchronizer.add({ renderingEngineId, viewportId: mid.id });

    const events = countCameraEvents([fine, coarse]);

    await mountSagittal(mid, midSeries);
    await renderAll([fine, coarse, mid]);
    events.stop();

    expect(events.counts()).toEqual({ [fine.id]: 0, [coarse.id]: 0 });
    expectPointsClose(cameraOf(fine).focalPoint, fineCamera.focalPoint, 6);
    expect(cameraOf(fine).parallelScale).toBeCloseTo(
      fineCamera.parallelScale,
      6
    );
    expect(mid.getSliceIndex()).toBe(Math.floor(mid.getNumberOfSlices() / 2));
    expectSameScaleAndCentre([fine, coarse, mid]);
  });

  it('gives panes of other extents one parallel scale and one centre at the first sync, whatever their own fit', async function () {
    const { panes } = await showSynchronized(renderingEngine, [
      'fine',
      'mid',
      'coarse',
    ]);
    const viewports = ['fine', 'mid', 'coarse'].map(
      (name) => panes[name].viewport
    );
    const [fine, mid, coarse] = viewports;

    expect(cameraOf(fine).parallelScale).not.toBeCloseTo(
      cameraOf(coarse).parallelScale,
      2
    );

    mid.setZoom(1.2);
    await renderAll(viewports);

    expectSameScaleAndCentre([mid, fine, coarse]);
    expect(fine.getZoom()).not.toBeCloseTo(coarse.getZoom(), 2);
  });
});
