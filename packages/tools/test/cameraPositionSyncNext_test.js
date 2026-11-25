import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextViewport,
  createSeries,
  expectPointsClose,
  renderAndWait,
  showStack,
  showVolume,
  waitFor,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, Enums } = cornerstone3D;
const { OrientationAxis } = Enums;
const { synchronizers, SynchronizerManager } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const synchronizerId = 'cameraPositionSyncNext';

/**
 * What the 5.x camera position synchronizer gave, measured on the legacy
 * stack and volume viewports of commit 58914567b with the same series: the
 * target took the camera of the source. The focal point is the one of the
 * stack at its image 2; the volume gave the same point in the plane.
 */
const LEGACY = {
  rotated45ViewUp: [-0.707107, -0.707107, 0],
  axialViewPlaneNormal: [0, 0, -1],
  zoomedPannedRotatedFocalPoint: [5.245442, 23.013676, 24],
  zoomedParallelScale: 9,
};

/** The camera of a viewport, from its resolved view. */
function cameraOf(viewport) {
  return viewport.getResolvedView().toICamera();
}

/**
 * Two viewports of one series at its image 2, in the same mode, kept
 * together by a camera position synchronizer. `targetOptions` are the
 * display set options of the second viewport.
 */
async function showSynchronizedPair(renderingEngine, id, show, targetOptions) {
  const series = await createSeries({ id });
  const source = createNextViewport(renderingEngine, `${id}Source`);
  const target = createNextViewport(renderingEngine, `${id}Target`);

  await show(source, series, 2);
  await show(target, series, 2, targetOptions);

  const synchronizer =
    synchronizers.createCameraPositionSynchronizer(synchronizerId);

  synchronizer.add({ renderingEngineId, viewportId: source.id });
  synchronizer.add({ renderingEngineId, viewportId: target.id });

  return { source, target };
}

/**
 * Writes a view state on the source and waits until the target has the
 * rotation of the source, or until the wait gives up.
 */
async function changeSource(source, target, viewState) {
  source.setViewState(viewState);
  await renderAndWait(source);
  await waitFor(
    () => Math.abs(target.getRotation() - source.getRotation()) < 1e-6,
    1000
  ).catch(() => undefined);
}

describe('The camera position synchronizer between direct next planar viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    SynchronizerManager.destroySynchronizer(synchronizerId);
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    cornerstone3D.displaySetRegistry.clear?.();
  });

  const modes = [
    { mode: 'stack', show: showStack },
    { mode: 'volume', show: showVolume },
  ];

  modes.forEach(({ mode, show }) => {
    it(`carries the rotation of the source in ${mode} mode, as the 5.x camera did`, async function () {
      const { source, target } = await showSynchronizedPair(
        renderingEngine,
        `cameraSyncRotation${mode}`,
        show
      );

      await changeSource(source, target, { rotation: 45 });

      expect(target.getRotation()).toBeCloseTo(45, 6);
      expectPointsClose(cameraOf(target).viewUp, LEGACY.rotated45ViewUp, 5);
      expectPointsClose(
        cameraOf(target).viewPlaneNormal,
        LEGACY.axialViewPlaneNormal,
        6
      );
      expectPointsClose(
        cameraOf(target).focalPoint,
        cameraOf(source).focalPoint,
        6
      );
    });

    it(`keeps carrying the zoom and the pan with the rotation in ${mode} mode`, async function () {
      const { source, target } = await showSynchronizedPair(
        renderingEngine,
        `cameraSyncZoomPan${mode}`,
        show
      );

      source.setZoom(2);
      source.setPan([12, -6]);
      await renderAndWait(source);
      await changeSource(source, target, { rotation: 45 });

      expect(target.getRotation()).toBeCloseTo(45, 6);
      expect(target.getZoom()).toBeCloseTo(2, 6);
      expectPointsClose(target.getPan(), source.getPan(), 4);
      expect(cameraOf(target).parallelScale).toBeCloseTo(
        LEGACY.zoomedParallelScale,
        5
      );
      expectPointsClose(
        cameraOf(target).focalPoint,
        LEGACY.zoomedPannedRotatedFocalPoint,
        4
      );
    });

    it(`carries the flips with the rotation in ${mode} mode, so the view up is the one of the source`, async function () {
      const { source, target } = await showSynchronizedPair(
        renderingEngine,
        `cameraSyncFlip${mode}`,
        show
      );

      await changeSource(source, target, {
        rotation: 30,
        flipHorizontal: true,
      });

      expect(target.getRotation()).toBeCloseTo(30, 6);
      expect(target.getViewState().flipHorizontal).toBe(true);
      expect(target.getViewState().flipVertical).toBe(false);
      expectPointsClose(cameraOf(target).viewUp, cameraOf(source).viewUp, 6);
      expectPointsClose(
        cameraOf(target).viewPlaneNormal,
        cameraOf(source).viewPlaneNormal,
        6
      );
    });
  });

  it('gives a volume target of another plane the view up of the source once, as the 5.x camera did', async function () {
    const { source, target } = await showSynchronizedPair(
      renderingEngine,
      'cameraSyncOtherPlane',
      showVolume,
      { orientation: OrientationAxis.SAGITTAL }
    );

    source.setViewState({ rotation: 45 });
    await renderAndWait(source);
    await waitFor(() =>
      utilities.isEqual(
        cameraOf(target).viewPlaneNormal,
        LEGACY.axialViewPlaneNormal
      )
    ).catch(() => undefined);

    expectPointsClose(cameraOf(target).viewUp, LEGACY.rotated45ViewUp, 5);
    expectPointsClose(
      cameraOf(target).viewPlaneNormal,
      LEGACY.axialViewPlaneNormal,
      6
    );

    source.setPan([5, 5]);
    await renderAndWait(source);
    await waitFor(() =>
      utilities.isEqual(target.getPan(), source.getPan(), 1e-3)
    ).catch(() => undefined);

    expectPointsClose(cameraOf(target).viewUp, cameraOf(source).viewUp, 6);
    expectPointsClose(
      cameraOf(target).viewPlaneNormal,
      cameraOf(source).viewPlaneNormal,
      6
    );
  });

  it('keeps the view up of a source turned and flipped on a volume target of another plane', async function () {
    const { source, target } = await showSynchronizedPair(
      renderingEngine,
      'cameraSyncOtherPlaneFlip',
      showVolume,
      { orientation: OrientationAxis.SAGITTAL }
    );

    source.setViewState({ rotation: 30, flipHorizontal: true });
    await renderAndWait(source);
    await waitFor(() =>
      utilities.isEqual(
        cameraOf(target).viewPlaneNormal,
        cameraOf(source).viewPlaneNormal
      )
    ).catch(() => undefined);
    source.setViewState({ rotation: 60 });
    await renderAndWait(source);
    await waitFor(() =>
      utilities.isEqual(cameraOf(target).viewUp, cameraOf(source).viewUp)
    ).catch(() => undefined);

    expectPointsClose(cameraOf(target).viewUp, cameraOf(source).viewUp, 6);
    expectPointsClose(
      cameraOf(target).viewPlaneNormal,
      cameraOf(source).viewPlaneNormal,
      6
    );
  });

  it('leaves a stack target on its image when the source is a sagittal slice of a volume of the series, whose slice index counts in that view', async function () {
    const series = await createSeries({ id: 'cameraSyncSagittalToStack' });
    const source = createNextViewport(renderingEngine, 'sagittalToStackSource');
    const target = createNextViewport(renderingEngine, 'sagittalToStackTarget');

    await showVolume(source, series, 0, {
      orientation: OrientationAxis.SAGITTAL,
    });
    await showStack(target, series, 2);

    const synchronizer =
      synchronizers.createCameraPositionSynchronizer(synchronizerId);

    synchronizer.add({ renderingEngineId, viewportId: source.id });
    synchronizer.add({ renderingEngineId, viewportId: target.id });

    const sliceIndex = source.getViewReference().sliceIndex;

    source.scroll(1);
    await renderAndWait(source);
    await waitFor(
      () => source.getViewReference().sliceIndex === sliceIndex + 1,
      1000
    ).catch(() => undefined);
    await renderAndWait(target);

    expect(source.getViewReference().sliceIndex).toBe(sliceIndex + 1);
    expect(target.getCurrentImageIdIndex()).toBe(2);
    expect(target.getCurrentImageId()).toBe(series.imageIds[2]);
  });
});
