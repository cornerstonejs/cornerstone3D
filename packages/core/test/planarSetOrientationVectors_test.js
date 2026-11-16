import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, getConfiguration, cache } =
  cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();
const SQRT_HALF = Math.sqrt(0.5);

/**
 * Makes a legacy volume viewport and a direct next planar viewport, both
 * axial and of one size, in one rendering engine.
 */
function createViewports(renderingEngine) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;
  const options = {
    orientation: OrientationAxis.AXIAL,
    width: 120,
    height: 120,
    useEnableElement: true,
  };

  rendering.useGenericViewport = false;
  testUtils.createViewports(renderingEngine, {
    ...options,
    viewportId: 'legacy',
    viewportType: ViewportType.ORTHOGRAPHIC,
  });
  rendering.useGenericViewport = useGenericViewport;
  testUtils.createViewports(renderingEngine, {
    ...options,
    viewportId: 'next',
    viewportType: ViewportType.PLANAR_NEXT,
  });

  return ['legacy', 'next'].map((id) => renderingEngine.getViewport(id));
}

async function createVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    id: 'orientationVectors',
    rows: 20,
    columns: 20,
    slices: 20,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

async function showVolumeOnNext(viewport, volumeId) {
  const displaySetId = `vectors:${viewport.id}`;

  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.AXIAL },
  });
}

function normalize(vector) {
  const length = Math.hypot(...vector);

  return vector.map((value) => value / length);
}

/**
 * The view up that a camera draws with: the stored view up made orthogonal
 * to the normal, as vtk.js builds the view transform from it.
 */
function getDrawnViewUp({ viewUp, viewPlaneNormal }) {
  const dot = viewUp.reduce(
    (sum, value, index) => sum + value * viewPlaneNormal[index],
    0
  );

  return normalize(
    viewUp.map((value, index) => value - dot * viewPlaneNormal[index])
  );
}

function expectClose(actual, expected) {
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 5);
  });
}

describe('setOrientation with vectors on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let legacy;
  let next;

  beforeEach(async function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
    [legacy, next] = createViewports(renderingEngine);

    const volumeId = await createVolume();

    await legacy.setVolumes([{ volumeId }]);
    await showVolumeOnNext(next, volumeId);
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  /**
   * Calls setOrientation with the orientation on both viewports and gives
   * the two cameras, or the error of the next viewport.
   */
  function setOrientationOnBoth(orientation) {
    legacy.setOrientation(orientation);

    let error;

    try {
      next.setOrientation(orientation);
    } catch (caught) {
      error = caught;
    }

    return {
      legacyCamera: legacy.getCamera(),
      nextCamera: error ? undefined : next.getCameraForEvent(),
      error,
    };
  }

  const cases = [
    {
      name: 'a normal without view up that the current view up is orthogonal to',
      before: OrientationAxis.SAGITTAL,
      orientation: { viewPlaneNormal: [SQRT_HALF, SQRT_HALF, 0] },
    },
    {
      name: 'an axis normal without view up that the current view up is not orthogonal to',
      before: OrientationAxis.AXIAL,
      orientation: { viewPlaneNormal: [0, 1, 0] },
    },
    {
      name: 'an oblique normal without view up that the current view up is not orthogonal to',
      before: OrientationAxis.AXIAL,
      orientation: { viewPlaneNormal: [0, SQRT_HALF, SQRT_HALF] },
    },
    {
      name: 'a view up that is not orthogonal to the normal',
      before: OrientationAxis.AXIAL,
      orientation: { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0.5] },
    },
  ];

  cases.forEach(({ name, before, orientation }) => {
    it(`draws the view of the legacy viewport for ${name}`, function () {
      legacy.setOrientation(before);
      next.setOrientation(before);

      const { legacyCamera, nextCamera, error } =
        setOrientationOnBoth(orientation);

      console.log(
        `[PLANAR_SET_ORIENTATION]${JSON.stringify({
          name,
          legacy: {
            viewPlaneNormal: legacyCamera.viewPlaneNormal,
            viewUp: legacyCamera.viewUp,
            drawnViewUp: getDrawnViewUp(legacyCamera),
          },
          next: nextCamera
            ? {
                viewPlaneNormal: nextCamera.viewPlaneNormal,
                viewUp: nextCamera.viewUp,
              }
            : { error: String(error) },
        })}`
      );

      expect(error).toBeUndefined();
      expectClose(nextCamera.viewPlaneNormal, legacyCamera.viewPlaneNormal);
      expectClose(nextCamera.viewUp, getDrawnViewUp(legacyCamera));
    });
  });
});
