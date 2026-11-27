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
const { synchronizers, SynchronizerManager, CrosshairsTool, ToolGroupManager } =
  csTools3d;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'crosshairsCameraPositionGroup';
const toolGroupId = 'crosshairsCameraPositionGroupTools';

const AXES = { rowCosines: [1, 0, 0], columnCosines: [0, 1, 0] };

/**
 * Two grids of one frame of reference, as a CT and a PET of one study: the
 * sagittal slices of the fine grid are 1 mm apart with one at x = 0, the
 * ones of the coarse grid 5 mm apart with x = 0 half way between two of
 * them (row 317 of `v6-open-issues.md`).
 */
const FINE_SIZE = {
  columns: 64,
  rows: 48,
  slices: 20,
  columnSpacing: 1,
  rowSpacing: 1,
  sliceSpacing: 2,
};
const FINE_ORIGIN = [-32, -24, -20];
const VOLUMES = {
  ct: { plane: { ...AXES, origin: FINE_ORIGIN }, size: FINE_SIZE },
  fusion: { plane: { ...AXES, origin: FINE_ORIGIN }, size: FINE_SIZE },
  pt: {
    plane: { ...AXES, origin: [-37.5, -42, -27] },
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

/** The camera of a planar viewport, from its resolved view. */
function cameraOf(viewport) {
  return viewport.getResolvedView().toICamera();
}

/** Mounts a volume of `VOLUMES` on a planar viewport in an orientation. */
async function mount(viewport, series, orientation) {
  const displaySetId = `crosshairsGroup:${viewport.id}`;

  displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { mode: 'volume', orientation },
  });
  await renderAndWait(viewport);
}

/** Renders every viewport once and waits for their frames. */
function renderAll(viewports) {
  return Promise.all(viewports.map((viewport) => renderAndWait(viewport)));
}

/**
 * Counts the CAMERA_MODIFIED events of viewports from now on, and gives the
 * counts by viewport id at the call of the function it returns, which
 * removes the listeners.
 */
function countCameraEvents(viewports) {
  const counts = Object.fromEntries(viewports.map(({ id }) => [id, 0]));
  const removers = viewports.map((viewport) => {
    const listener = () => {
      counts[viewport.id] += 1;
    };

    viewport.element.addEventListener(Events.CAMERA_MODIFIED, listener);

    return () =>
      viewport.element.removeEventListener(Events.CAMERA_MODIFIED, listener);
  });

  return () => {
    removers.forEach((remove) => remove());

    return { ...counts };
  };
}

/** The slice index and the focal point of each viewport, by viewport id. */
function viewsOf(viewports) {
  return Object.fromEntries(
    viewports.map((viewport) => [
      viewport.id,
      {
        sliceIndex: viewport.getSliceIndex(),
        focalPoint: [...cameraOf(viewport).focalPoint],
      },
    ])
  );
}

describe('The crosshairs set up after the mounts of panes of a camera position group (row 317) -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [CrosshairsTool],
    }).renderingEngine;
  });

  afterEach(function () {
    SynchronizerManager.destroySynchronizer(synchronizerId);
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
    displaySetRegistry.clear?.();
  });

  it('moves no slice of any pane and fires no camera event when the crosshairs are set passive, and centres where the slices that the views draw meet', async function () {
    const series = {};

    for (const [name, volume] of Object.entries(VOLUMES)) {
      series[name] = await createSeries({
        id: `crosshairsGroup${name}`,
        plane: volume.plane,
        size: volume.size,
      });
    }

    const ctSagittal = createNextViewport(renderingEngine, 'ctSagittal');
    const ptSagittal = createNextViewport(renderingEngine, 'ptSagittal');
    const fusionSagittal = createNextViewport(
      renderingEngine,
      'fusionSagittal'
    );
    const ptAxial = createNextViewport(renderingEngine, 'ptAxial');
    const ptCoronal = createNextViewport(renderingEngine, 'ptCoronal');
    const sagittalPanes = [ctSagittal, ptSagittal, fusionSagittal];
    const viewports = [...sagittalPanes, ptAxial, ptCoronal];
    const synchronizer =
      synchronizers.createCameraPositionSynchronizer(synchronizerId);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    sagittalPanes.forEach(({ id }) =>
      synchronizer.add({ renderingEngineId, viewportId: id })
    );
    toolGroup.addTool(CrosshairsTool.toolName);
    [ptAxial, ptSagittal, ptCoronal].forEach(({ id }) =>
      toolGroup.addViewport(id, renderingEngineId)
    );

    await mount(ctSagittal, series.ct, OrientationAxis.SAGITTAL);
    await mount(ptSagittal, series.pt, OrientationAxis.SAGITTAL);
    await mount(fusionSagittal, series.fusion, OrientationAxis.SAGITTAL);
    await mount(ptAxial, series.pt, OrientationAxis.AXIAL);
    await mount(ptCoronal, series.pt, OrientationAxis.CORONAL);

    const [, y, z] = cameraOf(ptSagittal).focalPoint;

    ptSagittal.setViewState({
      slice: { kind: 'volumePoint', sliceWorldPoint: [0, y, z] },
    });
    await renderAll(viewports);

    sagittalPanes.forEach((viewport) =>
      expect(cameraOf(viewport).focalPoint[0]).toBeCloseTo(0, 6)
    );

    const views = viewsOf(viewports);
    const stop = countCameraEvents(viewports);

    toolGroup.setToolPassive(CrosshairsTool.toolName);
    await renderAll(viewports);
    await renderAll(viewports);

    expect(stop()).toEqual(
      Object.fromEntries(viewports.map(({ id }) => [id, 0]))
    );

    const after = viewsOf(viewports);

    viewports.forEach(({ id }) => {
      expect(after[id].sliceIndex).toBe(views[id].sliceIndex);
      expectPointsClose(after[id].focalPoint, views[id].focalPoint, 6);
    });
    expect(ctSagittal.getSliceIndex()).toBe(32);

    const toolCenter = toolGroup.getToolInstance(
      CrosshairsTool.toolName
    ).toolCenter;
    const drawnSliceOf = (viewport) =>
      viewport.getViewReference().cameraFocalPoint;

    expect(drawnSliceOf(ptSagittal)[0]).toBeCloseTo(2.5, 6);
    expectPointsClose(
      toolCenter,
      [
        drawnSliceOf(ptSagittal)[0],
        drawnSliceOf(ptCoronal)[1],
        drawnSliceOf(ptAxial)[2],
      ],
      6
    );
  });
});
