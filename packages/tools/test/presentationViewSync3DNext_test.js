import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  showVolume,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, viewportProjection, Enums } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const { synchronizers, SynchronizerManager } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'presentationViewSync3DNext';
const ZOOM_PAN = { zoom: true, pan: true };

/** Resolves after two animation frames. */
function frames() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );
}

/** Makes a direct next 3D viewport of 400 by 300 pixels, sagittal. */
function create3D(renderingEngine, viewportId) {
  testUtils.createViewports(renderingEngine, {
    viewportId,
    viewportType: ViewportType.VOLUME_3D,
    orientation: OrientationAxis.SAGITTAL,
    width: 400,
    height: 300,
    useEnableElement: true,
  });

  return renderingEngine.getViewport(viewportId);
}

/** Shows the volume of a series on a direct next 3D viewport. */
async function show3D(viewport, series) {
  const displaySetId = `volume3D:${viewport.id}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: series.imageIds,
    volumeId: series.volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { renderMode: 'vtkVolume3d' },
  });
}

/** The zoom and the pan of a viewport through the projection service. */
function zoomPanOf(viewport) {
  const { zoom, pan } = viewportProjection.getPresentation(viewport, {
    selector: ZOOM_PAN,
  });

  return { zoom, pan };
}

/** Expects the zoom and the pan of a viewport. */
function expectZoomPan(viewport, zoom, pan) {
  const actual = zoomPanOf(viewport);

  expect(actual.zoom).toBeCloseTo(zoom, 4);
  expect(actual.pan[0]).toBeCloseTo(pan[0], 3);
  expect(actual.pan[1]).toBeCloseTo(pan[1], 3);
}

describe('The presentation view synchronizer with a direct next 3D viewport as its target -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    SynchronizerManager.destroySynchronizer(synchronizerId);
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    cornerstone3D.displaySetRegistry.clear();
  });

  it('gives a 3D target the zoom and the pan of a 3D source', async function () {
    const series = await createSeries({ id: 'presentationSync3D' });
    const source = create3D(renderingEngine, 'source3D');
    const target = create3D(renderingEngine, 'target3D');

    await show3D(source, series);
    await show3D(target, series);

    const synchronizer = synchronizers.createPresentationViewSynchronizer(
      synchronizerId,
      ZOOM_PAN
    );

    synchronizer.add({ renderingEngineId, viewportId: source.id });
    synchronizer.add({ renderingEngineId, viewportId: target.id });
    expectZoomPan(target, 1, [0, 0]);

    source.setViewState(
      viewportProjection.withPresentation(source, { zoom: 2, pan: [20, -10] })
    );
    await frames();

    expectZoomPan(source, 2, [20, -10]);
    expectZoomPan(target, 2, [20, -10]);
  });

  it('copies only what its selector names: with the zoom alone the pan of the 3D target stays', async function () {
    const series = await createSeries({ id: 'presentationSyncZoomOnly' });
    const source = create3D(renderingEngine, 'source3D');
    const target = create3D(renderingEngine, 'target3D');

    await show3D(source, series);
    await show3D(target, series);

    const synchronizer = synchronizers.createPresentationViewSynchronizer(
      synchronizerId,
      { zoom: true }
    );

    synchronizer.add({ renderingEngineId, viewportId: source.id });
    synchronizer.add({ renderingEngineId, viewportId: target.id });

    source.setViewState(
      viewportProjection.withPresentation(source, { zoom: 2, pan: [20, -10] })
    );
    await frames();

    expectZoomPan(source, 2, [20, -10]);
    expectZoomPan(target, 2, [0, 0]);
  });

  it('gives a 3D target the zoom and the pan of a planar source', async function () {
    const series = await createSeries({ id: 'presentationSyncPlanarTo3D' });
    const source = createNextViewport(renderingEngine, 'planarSource');
    const target = create3D(renderingEngine, 'target3D');

    await showVolume(source, series, 2);
    await show3D(target, series);

    const synchronizer = synchronizers.createPresentationViewSynchronizer(
      synchronizerId,
      ZOOM_PAN
    );

    synchronizer.add({ renderingEngineId, viewportId: source.id });
    synchronizer.add({ renderingEngineId, viewportId: target.id });

    source.setViewState(
      viewportProjection.withPresentation(source, { zoom: 3, pan: [-15, 5] })
    );
    await frames();

    expectZoomPan(source, 3, [-15, 5]);
    expectZoomPan(target, 3, [-15, 5]);
  });
});
