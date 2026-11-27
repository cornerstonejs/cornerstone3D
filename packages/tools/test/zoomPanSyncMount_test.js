import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  renderAndWait,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, Enums, displaySetRegistry, viewportProjection } =
  cornerstone3D;
const { OrientationAxis, ViewportType, Events } = Enums;
const { synchronizers, SynchronizerManager } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'zoomPanSyncMount';

/**
 * The zoom and pan synchronizer and the view framing synchronizer read the
 * camera event of a mount, which changes no camera, as the camera position
 * synchronizer reads it (row 330): the pane that mounts takes the zoom and
 * the pan of its group and writes no pane of the group. Before, it gave the
 * group its fit.
 */
const SYNCHRONIZERS = [
  [
    'the zoom and pan synchronizer',
    () => synchronizers.createZoomPanSynchronizer(synchronizerId),
  ],
  [
    'the view framing synchronizer',
    () =>
      synchronizers.createViewFramingSynchronizer(synchronizerId, {
        zoom: true,
        pan: true,
      }),
  ],
];

/** The zoom and the pan of the group, against the fit of each pane. */
const GROUP_ZOOM = 2;
const GROUP_PAN = [15, -10];

/** The elements that a test made, removed after it. */
const elements = [];

/** Enables a 3D viewport of 400 by 300 pixels. */
function enable3D(renderingEngine, viewportId) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  elements.push(element);
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: {
      orientation: OrientationAxis.SAGITTAL,
      background: [1, 0, 1],
    },
  });

  return renderingEngine.getViewport(viewportId);
}

/**
 * Mounts a series on a viewport, as an application mounts a display set:
 * its volume on a planar viewport in volume mode or on a 3D viewport, or its
 * images as a stack, and waits for its first frame.
 */
async function mount(viewport, series, mode) {
  const displaySetId = `${mode}:${viewport.id}`;

  displaySetRegistry.add(
    displaySetId,
    mode === 'stack'
      ? { imageIds: series.imageIds }
      : { imageIds: series.imageIds, volumeId: series.volumeId }
  );
  await viewport.setDisplaySets({
    displaySetId,
    options:
      mode === '3d'
        ? {}
        : {
            mode,
            orientation: OrientationAxis.ACQUISITION,
            initialImageIdIndex: 2,
          },
  });
  await renderAndWait(viewport);
}

/** The panes that join a group, by how they are made and mounted. */
const PANES = [
  ['a planar pane in volume mode', 'volume'],
  ['a planar pane in stack mode', 'stack'],
  ['a 3D pane', '3d'],
];

/** Enables a viewport of the kind of a mode. */
function enable(renderingEngine, viewportId, mode) {
  return mode === '3d'
    ? enable3D(renderingEngine, viewportId)
    : createNextViewport(renderingEngine, viewportId);
}

/** The zoom and the pan of a viewport against its fit. */
function zoomPanOf(viewport) {
  return viewportProjection.getFraming(viewport, {
    selector: { zoom: true, pan: true },
  });
}

/** Expects a viewport to show the zoom and the pan given. */
function expectZoomPan(viewport, zoom, pan) {
  const framing = zoomPanOf(viewport);

  expect(framing.zoom).toBeCloseTo(zoom, 4);
  expect(framing.pan[0]).toBeCloseTo(pan[0], 3);
  expect(framing.pan[1]).toBeCloseTo(pan[1], 3);
}

/** Gives a viewport the zoom and the pan of the group. */
async function frameAsGroup(viewport) {
  viewport.setViewState(
    viewportProjection.withFraming(viewport, {
      zoom: GROUP_ZOOM,
      pan: GROUP_PAN,
    })
  );
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

SYNCHRONIZERS.forEach(([synchronizerName, createSynchronizer]) => {
  describe(`${synchronizerName} at the mount of a pane (row 330) -- `, () => {
    let renderingEngine;

    beforeEach(function () {
      renderingEngine = testUtils.setupTestEnvironment({
        renderingEngineId,
      }).renderingEngine;
    });

    afterEach(function () {
      SynchronizerManager.destroySynchronizer(synchronizerId);
      testUtils.cleanupTestEnvironment({ renderingEngineId });
      elements.splice(0).forEach((element) => element.remove());
    });

    PANES.forEach(([paneName, mode]) => {
      it(`gives ${paneName} that joins a group in step the zoom and the pan of the group at its mount, and writes no pane of the group`, async function () {
        const series = await createSeries({ id: `zoomPanMount-${mode}` });
        const first = createNextViewport(renderingEngine, 'firstPane');
        const second = createNextViewport(renderingEngine, 'secondPane');

        await mount(first, series, 'volume');
        await mount(second, series, 'volume');

        const synchronizer = createSynchronizer();

        [first, second].forEach((viewport) =>
          synchronizer.add({ renderingEngineId, viewportId: viewport.id })
        );
        await frameAsGroup(first);
        await renderAndWait(second);

        expectZoomPan(second, GROUP_ZOOM, GROUP_PAN);

        const joining = enable(renderingEngine, 'joiningPane', mode);

        synchronizer.add({ renderingEngineId, viewportId: joining.id });

        const events = countCameraEvents([first, second]);

        await mount(joining, series, mode);
        await renderAndWait(joining);
        events.stop();

        expect(events.counts()).toEqual({ [first.id]: 0, [second.id]: 0 });
        expectZoomPan(first, GROUP_ZOOM, GROUP_PAN);
        expectZoomPan(second, GROUP_ZOOM, GROUP_PAN);
        expectZoomPan(joining, GROUP_ZOOM, GROUP_PAN);
      });

      it(`gives ${paneName} that joins a group of one pane, placed while it was alone in the group, the zoom and the pan of that pane at its mount`, async function () {
        const series = await createSeries({ id: `zoomPanAlone-${mode}` });
        const placed = createNextViewport(renderingEngine, 'placedPane');

        await mount(placed, series, 'volume');

        const synchronizer = createSynchronizer();

        synchronizer.add({ renderingEngineId, viewportId: placed.id });
        await frameAsGroup(placed);

        const joining = enable(renderingEngine, 'joiningPane', mode);

        synchronizer.add({ renderingEngineId, viewportId: joining.id });

        const events = countCameraEvents([placed]);

        await mount(joining, series, mode);
        await renderAndWait(joining);
        events.stop();

        expect(events.counts()).toEqual({ [placed.id]: 0 });
        expectZoomPan(placed, GROUP_ZOOM, GROUP_PAN);
        expectZoomPan(joining, GROUP_ZOOM, GROUP_PAN);
      });
    });

    it('keeps the zoom and the pan of a pane that mounts alone in the group, and gives the group a zoom of a pane after its mount', async function () {
      const series = await createSeries({ id: 'zoomPanLone' });
      const lone = createNextViewport(renderingEngine, 'lonePane');
      const empty = createNextViewport(renderingEngine, 'emptyPane');
      const synchronizer = createSynchronizer();

      [lone, empty].forEach((viewport) =>
        synchronizer.add({ renderingEngineId, viewportId: viewport.id })
      );
      await mount(lone, series, 'volume');

      expectZoomPan(lone, 1, [0, 0]);

      await mount(empty, series, 'stack');
      await frameAsGroup(empty);
      await renderAndWait(lone);

      expectZoomPan(lone, GROUP_ZOOM, GROUP_PAN);
    });
  });
});
