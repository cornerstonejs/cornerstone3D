import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, getConfiguration, cache } =
  cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * Makes viewports of one size and orientation in one rendering engine: a
 * legacy 3D viewport when `legacyId` is given, then a direct next 3D viewport
 * for each of `nextIds`. The switch of the generic viewports is off for the
 * legacy one, so it is the legacy class with or without
 * FORCE_GENERIC_VIEWPORT.
 */
function createViewports(renderingEngine, { legacyId, nextIds }) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;
  const viewportOptions = {
    orientation: OrientationAxis.SAGITTAL,
    width: 400,
    height: 300,
    useEnableElement: true,
  };

  if (legacyId) {
    rendering.useGenericViewport = false;
    testUtils.createViewports(renderingEngine, {
      ...viewportOptions,
      viewportId: legacyId,
      viewportType: ViewportType.VOLUME_3D,
    });
    rendering.useGenericViewport = useGenericViewport;
  }

  nextIds.forEach((viewportId) =>
    testUtils.createViewports(renderingEngine, {
      ...viewportOptions,
      viewportId,
      viewportType: ViewportType.VOLUME_3D_NEXT,
    })
  );

  return [legacyId, ...nextIds]
    .filter(Boolean)
    .map((viewportId) => renderingEngine.getViewport(viewportId));
}

/**
 * Makes and caches a volume of the fake volume loader: 40 columns, 30 rows
 * and 12 slices 2 mm apart, so the extent differs along each axis.
 */
async function createVolume() {
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

  return volumeId;
}

/** Shows the volume on a direct next 3D viewport through a display set. */
async function showVolume(viewport, volumeId) {
  const displaySetId = `next3D:${viewport.id}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { renderMode: 'vtkVolume3d' },
  });
}

function expectPointsClose(actual, expected, precision = 4) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], precision);
  });
}

/** Expects the camera of the next viewport to be the legacy camera. */
function expectSameCamera(nextCamera, legacyCamera) {
  expect(nextCamera.parallelScale).toBeCloseTo(legacyCamera.parallelScale, 4);
  expectPointsClose(nextCamera.focalPoint, legacyCamera.focalPoint);
  expectPointsClose(nextCamera.viewPlaneNormal, legacyCamera.viewPlaneNormal);
  expectPointsClose(nextCamera.viewUp, legacyCamera.viewUp);
}

describe('Direct next 3D viewport -- ', () => {
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

  it('fits again on resetViewState as the legacy viewport fits on resetCamera', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await legacy.setVolumes([{ volumeId }]);
    await showVolume(next, volumeId);

    expectSameCamera(next.getViewState(), legacy.getCamera());

    const { focalPoint, position, parallelScale } = legacy.getCamera();
    const zoomedCamera = {
      parallelScale: parallelScale / 3,
      focalPoint: [focalPoint[0], focalPoint[1] + 6, focalPoint[2] - 4],
      position: [position[0], position[1] + 6, position[2] - 4],
    };

    legacy.setCamera(zoomedCamera);
    next.setViewState(zoomedCamera);
    legacy.resetCamera();
    next.resetViewState();

    expectSameCamera(next.getViewState(), legacy.getCamera());
  });

  it('keeps the zoom on resetViewState with resetZoom false, as the legacy viewport', async function () {
    const [legacy, next] = createViewports(renderingEngine, {
      legacyId: 'legacy3D',
      nextIds: ['next3D'],
    });
    const volumeId = await createVolume();

    await legacy.setVolumes([{ volumeId }]);
    await showVolume(next, volumeId);

    const parallelScale = legacy.getCamera().parallelScale / 2;

    legacy.setCamera({ parallelScale });
    next.setViewState({ parallelScale });
    legacy.resetCamera({ resetZoom: false });
    next.resetViewState({ resetZoom: false });

    expectSameCamera(next.getViewState(), legacy.getCamera());
  });

  it('turns to the view of a view reference of another next 3D viewport', async function () {
    const [source, target] = createViewports(renderingEngine, {
      nextIds: ['source3D', 'target3D'],
    });
    const volumeId = await createVolume();

    await showVolume(source, volumeId);
    await showVolume(target, volumeId);

    const { focalPoint, position } = source.getViewState();
    const distance = Math.hypot(
      position[0] - focalPoint[0],
      position[1] - focalPoint[1],
      position[2] - focalPoint[2]
    );
    const viewPlaneNormal = [0, -1, 0];

    source.setViewState({
      viewUp: [0, 0, 1],
      focalPoint: [focalPoint[0] + 2, focalPoint[1] + 5, focalPoint[2]],
      position: [
        focalPoint[0] + 2,
        focalPoint[1] + 5 + distance * viewPlaneNormal[1],
        focalPoint[2],
      ],
    });

    const sourceCamera = source.getViewState();
    const targetZoom = target.getViewState().parallelScale;

    target.setViewReference(source.getViewReference());

    const targetCamera = target.getViewState();

    expectPointsClose(targetCamera.viewPlaneNormal, viewPlaneNormal);
    expectPointsClose(
      targetCamera.viewPlaneNormal,
      sourceCamera.viewPlaneNormal
    );
    expectPointsClose(targetCamera.viewUp, sourceCamera.viewUp);
    expect(
      utilities.isEqual(
        [
          (targetCamera.focalPoint[0] - sourceCamera.focalPoint[0]) *
            viewPlaneNormal[0] +
            (targetCamera.focalPoint[1] - sourceCamera.focalPoint[1]) *
              viewPlaneNormal[1] +
            (targetCamera.focalPoint[2] - sourceCamera.focalPoint[2]) *
              viewPlaneNormal[2],
        ],
        [0]
      )
    ).toBe(true);
    expect(targetCamera.parallelScale).toBeCloseTo(targetZoom, 6);
  });

  it('ignores a view reference of another frame of reference', async function () {
    const [next] = createViewports(renderingEngine, { nextIds: ['next3D'] });
    const volumeId = await createVolume();

    await showVolume(next, volumeId);

    const camera = next.getViewState();

    next.setViewReference({
      ...next.getViewReference(),
      FrameOfReferenceUID: 'another',
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
    });

    expectSameCamera(next.getViewState(), camera);
  });
});
