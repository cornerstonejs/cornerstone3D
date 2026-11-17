import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

const { Enums, volumeLoader, utilities, getConfiguration } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * Makes a legacy 3D viewport and a 3D legacy adapter of the same size and
 * orientation in one rendering engine. The switch of the generic viewports
 * is set for each, so the pair is the same with or without
 * FORCE_GENERIC_VIEWPORT.
 */
function createPair(renderingEngine, orientation = OrientationAxis.SAGITTAL) {
  const rendering = getConfiguration().rendering;
  const useGenericViewport = rendering.useGenericViewport;

  rendering.useGenericViewport = false;
  testUtils.createViewports(renderingEngine, {
    viewportId: 'legacy3D',
    viewportType: ViewportType.VOLUME_3D,
    orientation,
    width: 400,
    height: 300,
    useEnableElement: true,
  });
  rendering.useGenericViewport = true;
  testUtils.createViewports(renderingEngine, {
    viewportId: 'adapter3D',
    viewportType: ViewportType.VOLUME_3D,
    orientation,
    width: 400,
    height: 300,
    useEnableElement: true,
  });
  rendering.useGenericViewport = useGenericViewport;

  return [
    renderingEngine.getViewport('legacy3D'),
    renderingEngine.getViewport('adapter3D'),
  ];
}

/**
 * Makes and caches a volume of the fake volume loader: 40 columns, 30 rows
 * and 12 slices 2 mm apart, so the extent differs along each axis. The name
 * is also the id of its images, so two volumes have different images.
 */
async function createVolume(name = 'volumeURI') {
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

/** A vtk.js sphere of radius 100 around the origin, as the sphere test draws. */
function createSphereActorEntry() {
  const sphereSource = vtkSphereSource.newInstance({
    center: [0, 0, 0],
    radius: 100,
    phiResolution: 10,
    thetaResolution: 10,
  });
  const actor = vtkActor.newInstance();
  const mapper = vtkMapper.newInstance();

  mapper.setInputConnection(sphereSource.getOutputPort());
  actor.setMapper(mapper);

  return { uid: 'spherePolyData', actor };
}

function expectPointsClose(actual, expected, precision = 4) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], precision);
  });
}

/** Expects the same camera on the adapter as on the legacy viewport. */
function expectSameCamera(adapter, legacy) {
  const adapterCamera = adapter.getCamera();
  const legacyCamera = legacy.getCamera();

  expect(adapterCamera.parallelScale).toBeCloseTo(
    legacyCamera.parallelScale,
    4
  );
  expectPointsClose(adapterCamera.focalPoint, legacyCamera.focalPoint);
  expectPointsClose(
    adapterCamera.viewPlaneNormal,
    legacyCamera.viewPlaneNormal
  );
  expectPointsClose(adapterCamera.viewUp, legacyCamera.viewUp);
}

describe('3D legacy adapter against the legacy 3D viewport -- ', () => {
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

  it('makes one legacy viewport and one adapter', function () {
    const [legacy, adapter] = createPair(renderingEngine);

    expect(utilities.isGenericViewport(legacy)).toBe(false);
    expect(utilities.isGenericViewport(adapter)).toBe(true);
  });

  it('fits a volume as the legacy viewport on setVolumes and resetCamera', async function () {
    const [legacy, adapter] = createPair(renderingEngine);
    const volumeId = await createVolume();

    await legacy.setVolumes([{ volumeId }]);
    await adapter.setVolumes([{ volumeId }]);

    expectSameCamera(adapter, legacy);

    for (const viewport of [legacy, adapter]) {
      viewport.setZoom(3);
      viewport.setPan([20, -10]);
      viewport.resetCamera();
    }

    expectSameCamera(adapter, legacy);
    expect(adapter.getZoom()).toBeCloseTo(1, 6);
  });

  it('fits actors as the legacy viewport on setActors', function () {
    const [legacy, adapter] = createPair(renderingEngine);

    legacy.setActors([createSphereActorEntry()]);
    adapter.setActors([createSphereActorEntry()]);

    expectSameCamera(adapter, legacy);
    expect(adapter.getActors().map(({ uid }) => uid)).toEqual(
      legacy.getActors().map(({ uid }) => uid)
    );
  });

  it('gives the actor UID of the volume input to its actors and events, as the legacy viewport', async function () {
    const [legacy, adapter] = createPair(renderingEngine);
    const volumeId = await createVolume();
    const eventUIDs = new Map();

    for (const viewport of [legacy, adapter]) {
      viewport.element.addEventListener(
        Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
        (evt) =>
          eventUIDs.set(
            viewport,
            evt.detail.volumeActors.map(({ uid }) => uid)
          )
      );
      await viewport.setVolumes([{ volumeId, actorUID: 'ctActor' }]);
    }

    const actorUIDs = (viewport) => viewport.getActors().map(({ uid }) => uid);

    expect(actorUIDs(adapter)).toEqual(actorUIDs(legacy));
    expect(eventUIDs.get(adapter)).toEqual(eventUIDs.get(legacy));
    expect(adapter.getActor('ctActor')?.referencedId).toBe(
      legacy.getActor('ctActor').referencedId
    );

    adapter.removeVolumeActors(['ctActor']);

    expect(adapter.getActors()).toEqual([]);
  });

  it('gives the same actor UID to its actors and its events without an actor UID', async function () {
    const [, adapter] = createPair(renderingEngine);
    const volumeId = await createVolume();
    let eventUIDs;

    adapter.element.addEventListener(
      Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
      (evt) => {
        eventUIDs = evt.detail.volumeActors.map(({ uid }) => uid);
      }
    );
    await adapter.setVolumes([{ volumeId }]);

    expect(adapter.getActors().map(({ uid }) => uid)).toEqual(eventUIDs);
    expect(adapter.getActor(eventUIDs[0])?.referencedId).toBe(volumeId);
  });

  it('keeps the resetCamera options as the legacy viewport', async function () {
    const [legacy, adapter] = createPair(renderingEngine);
    const volumeId = await createVolume();

    await legacy.setVolumes([{ volumeId }]);
    await adapter.setVolumes([{ volumeId }]);

    for (const viewport of [legacy, adapter]) {
      viewport.setZoom(2);
      viewport.setPan([15, 5]);
      viewport.resetCamera({ resetZoom: false, resetPan: false });
    }

    expectSameCamera(adapter, legacy);
  });

  it('keeps the volume that it shows on addVolumes, as the legacy viewport', async function () {
    const [legacy, adapter] = createPair(renderingEngine);
    const firstVolumeId = await createVolume('first');
    const secondVolumeId = await createVolume('second');

    for (const viewport of [legacy, adapter]) {
      await viewport.setVolumes([{ volumeId: firstVolumeId }]);
      await viewport.addVolumes([
        { volumeId: secondVolumeId, visibility: true },
      ]);
    }

    const referencedIds = (viewport) =>
      viewport.getActors().map(({ referencedId }) => referencedId);

    expect(referencedIds(legacy)).toEqual([firstVolumeId, secondVolumeId]);
    expect(referencedIds(adapter)).toEqual(referencedIds(legacy));
    expect(adapter.getAllVolumeIds()).toEqual([firstVolumeId, secondVolumeId]);
    expectSameCamera(adapter, legacy);
  });

  it('moves to a view reference as the legacy viewport', async function () {
    const [legacy, adapter] = createPair(renderingEngine);
    const volumeId = await createVolume();

    await legacy.setVolumes([{ volumeId }]);
    await adapter.setVolumes([{ volumeId }]);

    const { focalPoint, viewPlaneNormal } = legacy.getCamera();
    const cameraFocalPoint = [
      focalPoint[0] + 4 * viewPlaneNormal[0] + 3,
      focalPoint[1] + 4 * viewPlaneNormal[1] + 3,
      focalPoint[2] + 4 * viewPlaneNormal[2] + 3,
    ];
    const viewRef = {
      FrameOfReferenceUID: legacy.getFrameOfReferenceUID(),
      cameraFocalPoint,
      viewPlaneNormal,
    };

    legacy.setViewReference(viewRef);
    adapter.setViewReference(viewRef);

    expectSameCamera(adapter, legacy);

    const sliceRef = {
      FrameOfReferenceUID: legacy.getFrameOfReferenceUID(),
      volumeId,
      sliceIndex: 2,
      viewPlaneNormal,
    };

    legacy.setViewReference(sliceRef);
    adapter.setViewReference(sliceRef);

    expectSameCamera(adapter, legacy);
  });

  it('gives the zoom and the pan of the legacy viewport', async function () {
    const [legacy, adapter] = createPair(renderingEngine);
    const volumeId = await createVolume();

    await legacy.setVolumes([{ volumeId }]);
    await adapter.setVolumes([{ volumeId }]);

    for (const viewport of [legacy, adapter]) {
      viewport.setZoom(1.5);
      viewport.setPan([12, -8]);
    }

    expectSameCamera(adapter, legacy);
    expect(adapter.getZoom()).toBeCloseTo(legacy.getZoom(), 6);
    expectPointsClose(adapter.getPan(), legacy.getPan(), 3);
  });

  it('answers the volume and slice members as the legacy viewport', async function () {
    const [legacy, adapter] = createPair(renderingEngine);
    const volumeId = await createVolume();

    await legacy.setVolumes([{ volumeId }]);
    await adapter.setVolumes([{ volumeId }]);

    const { imageIds } = cornerstone3D.cache.getVolume(volumeId);
    const point = legacy.getCamera().focalPoint;

    for (const member of [
      'getNumberOfSlices',
      'getCurrentImageIdIndex',
      'getCurrentImageId',
      'getSliceIndex',
      'isInAcquisitionPlane',
      'getSlabThickness',
      'getRotation',
      'getAllVolumeIds',
      'getBounds',
    ]) {
      expect(adapter[member]()).toEqual(legacy[member]());
    }

    expect(adapter.getIntensityFromWorld(point)).toBe(
      legacy.getIntensityFromWorld(point)
    );
    expect(adapter.hasImageURI(imageIds[3])).toBe(
      legacy.hasImageURI(imageIds[3])
    );
    expect(adapter.hasImageURI('notAnImage')).toBe(false);
    expect(adapter.getImageActor()).toBe(adapter.getActors()[0].actor);
    expect(adapter.isOrientationChangeable()).toBe(
      legacy.isOrientationChangeable()
    );
  });

  it('fires no camera event for a call that asks for suppressEvents, and fires them for the next call', async function () {
    const [, adapter] = createPair(renderingEngine);
    const volumeId = await createVolume();
    const counts = { modified: 0, reset: 0 };

    await adapter.setVolumes([{ volumeId }]);
    adapter.element.addEventListener(Enums.Events.CAMERA_MODIFIED, () => {
      counts.modified++;
    });
    adapter.element.addEventListener(Enums.Events.CAMERA_RESET, () => {
      counts.reset++;
    });

    adapter.setOrientation(OrientationAxis.AXIAL, true, true);

    expect(counts).toEqual({ modified: 0, reset: 0 });
    expect(adapter.suppressEvents).toBe(false);

    adapter.resetCamera();

    expect(counts.modified).toBeGreaterThan(0);
    expect(counts.reset).toBe(1);
  });
});
