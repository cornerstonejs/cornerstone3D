import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache, viewportProjection } =
  cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * The camera of the legacy 3D viewport of 400 by 300 pixels, coronal, after
 * `setVolumes` with the volume of the tests (commit 58914567b). It was the
 * same after a `resetCamera` and a `setCamera` on the empty viewport before
 * the mount, and when the voxels of the volume came after the mount.
 */
const LEGACY_CORONAL_CAMERA = {
  parallelProjection: true,
  parallelScale: 12,
  viewAngle: 90,
  focalPoint: [14.5, 20, 11],
  position: [14.5, -257.3085, 11],
  viewPlaneNormal: [0, -1, 0],
  viewUp: [0, 0, 1],
};

/** Makes a direct next 3D viewport of 400 by 300 pixels, coronal. */
function createNextViewport(renderingEngine) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId: 'next3DFirstCamera',
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: {
      orientation: OrientationAxis.CORONAL,
      background: [1, 0, 1],
    },
  });

  return renderingEngine.getViewport('next3DFirstCamera');
}

/**
 * Makes and caches a volume of the fake volume loader: 40 columns, 30 rows
 * and 12 slices 2 mm apart. Its voxels are all zero until `fillVolume`.
 */
async function createVolume(name) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name,
    id: name,
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

/** Writes stripes into every voxel of the volume, as a load would. */
function fillVolume(volumeId) {
  const { voxelManager, dimensions } = cache.getVolume(volumeId);

  for (let k = 0; k < dimensions[2]; k++) {
    for (let j = 0; j < dimensions[1]; j++) {
      for (let i = 0; i < dimensions[0]; i++) {
        voxelManager.setAtIJK(i, j, k, (i * 9 + j * 5 + k * 20) % 256);
      }
    }
  }
}

/** Shows the volume on the next viewport through a display set. */
async function showVolume(next, volumeId) {
  const displaySetId = `firstCamera:${volumeId}`;

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await next.setDisplaySets({
    displaySetId,
  });
}

function expectPointsClose(actual, expected, precision = 3) {
  expect(actual.length).toBe(expected.length);
  Array.from(actual).forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], precision);
  });
}

/** Expects the camera of the next viewport to be the legacy camera. */
function expectLegacyCamera(next) {
  const camera = next.getViewState();

  expect(camera.parallelProjection).toBe(
    LEGACY_CORONAL_CAMERA.parallelProjection
  );
  expect(camera.parallelScale).toBeCloseTo(
    LEGACY_CORONAL_CAMERA.parallelScale,
    4
  );
  expect(camera.viewAngle).toBeCloseTo(LEGACY_CORONAL_CAMERA.viewAngle, 4);
  expectPointsClose(camera.focalPoint, LEGACY_CORONAL_CAMERA.focalPoint);
  expectPointsClose(camera.position, LEGACY_CORONAL_CAMERA.position);
  expectPointsClose(
    camera.viewPlaneNormal,
    LEGACY_CORONAL_CAMERA.viewPlaneNormal
  );
  expectPointsClose(camera.viewUp, LEGACY_CORONAL_CAMERA.viewUp);
}

describe('The first camera of a direct next 3D viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
  });

  it('fits the mount in the orientation of the options after a reset and a view state written while it showed nothing, as the legacy 3D viewport', async function () {
    const volumeId = await createVolume('firstCameraAfterEmptyWrite');
    const next = createNextViewport(renderingEngine);
    const presentation = viewportProjection.getFraming(next);

    next.resetViewState();
    if (presentation) {
      next.setViewState(viewportProjection.withFraming(next, presentation));
    }
    next.setViewState(next.getViewState());

    await showVolume(next, volumeId);
    fillVolume(volumeId);
    next.render();

    expectLegacyCamera(next);
  });

  it('fits the mount of a volume whose voxels arrive after it, as the legacy 3D viewport', async function () {
    const volumeId = await createVolume('firstCameraLateVoxels');
    const next = createNextViewport(renderingEngine);

    await showVolume(next, volumeId);
    fillVolume(volumeId);
    next.render();

    expectLegacyCamera(next);
  });

  it('keeps the orientation of the options on a reset after such a mount', async function () {
    const volumeId = await createVolume('firstCameraReset');
    const next = createNextViewport(renderingEngine);

    next.resetViewState();
    next.setViewState(next.getViewState());
    await showVolume(next, volumeId);
    next.setViewState({ parallelScale: 30 });
    next.resetViewState();

    expectLegacyCamera(next);
  });
});
