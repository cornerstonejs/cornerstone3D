import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache, displaySetRegistry } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/** The sizes of the two volumes of the tests, of other extents. */
const VOLUMES = {
  small: { rows: 30, columns: 40, slices: 12, zSpacing: 2 },
  large: { rows: 50, columns: 64, slices: 20, zSpacing: 3 },
};

/** Makes a direct next 3D viewport of 400 by 300 pixels, sagittal. */
function createNextViewport(renderingEngine, defaultOptions = {}) {
  const element = document.createElement('div');

  element.style.width = '400px';
  element.style.height = '300px';
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId: 'next3DMountCameraEvent',
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: {
      orientation: OrientationAxis.SAGITTAL,
      background: [1, 0, 1],
      ...defaultOptions,
    },
  });

  return renderingEngine.getViewport('next3DMountCameraEvent');
}

/**
 * Makes and caches a volume of the fake volume loader of one of the sizes
 * of `VOLUMES`, and registers a display set of it.
 */
async function createDisplaySet(name, sizeName) {
  const size = VOLUMES[sizeName];
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name,
    id: name,
    rows: size.rows,
    columns: size.columns,
    slices: size.slices,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: size.zSpacing,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  const displaySetId = `mountCameraEvent:${name}`;

  displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });

  return displaySetId;
}

/**
 * Records the type and the detail of the CAMERA_MODIFIED and
 * DISPLAY_SETS_CHANGED events of a viewport, in the order they fire.
 * `stop()` removes the listeners.
 */
function recordMountEvents(viewport) {
  const events = [];
  const types = [Events.CAMERA_MODIFIED, Events.DISPLAY_SETS_CHANGED];
  const listener = (event) =>
    events.push({ type: event.type, detail: event.detail });

  types.forEach((type) => viewport.element.addEventListener(type, listener));

  return {
    events,
    cameraEvents: () =>
      events.filter(({ type }) => type === Events.CAMERA_MODIFIED),
    stop: () =>
      types.forEach((type) =>
        viewport.element.removeEventListener(type, listener)
      ),
  };
}

/** Counts the IMAGE_RENDERED events of a viewport until `stop()`. */
function countFrames(viewport) {
  let frames = 0;
  const listener = () => {
    frames += 1;
  };

  viewport.element.addEventListener(Events.IMAGE_RENDERED, listener);

  return () => {
    viewport.element.removeEventListener(Events.IMAGE_RENDERED, listener);

    return frames;
  };
}

/** Waits for a number of animation frames. */
async function waitFrames(count) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

function expectPointsClose(actual, expected, precision = 4) {
  expect(actual.length).toBe(expected.length);
  Array.from(actual).forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], precision);
  });
}

/** Expects two cameras of an event to be one camera. */
function expectSameCamera(camera, other) {
  expectPointsClose(camera.focalPoint, other.focalPoint);
  expectPointsClose(camera.position, other.position, 3);
  expectPointsClose(camera.viewPlaneNormal, other.viewPlaneNormal);
  expectPointsClose(camera.viewUp, other.viewUp);
  expect(camera.parallelScale).toBeCloseTo(other.parallelScale, 4);
}

describe('The camera event of the mount of a direct next 3D viewport (row 314) -- ', () => {
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
    displaySetRegistry.clear?.();
  });

  it('fires one CAMERA_MODIFIED at its first mount, before DISPLAY_SETS_CHANGED, with the camera it opens with as the camera and as the previous camera, as a planar mount', async function () {
    const displaySetId = await createDisplaySet('first', 'small');
    const next = createNextViewport(renderingEngine);
    const recorded = recordMountEvents(next);

    await next.setDisplaySets({ displaySetId });
    recorded.stop();

    expect(recorded.events.map(({ type }) => type)).toEqual([
      Events.CAMERA_MODIFIED,
      Events.DISPLAY_SETS_CHANGED,
    ]);

    const [{ detail }] = recorded.cameraEvents();

    expect(detail.viewportId).toBe(next.id);
    expect(detail.renderingEngineId).toBe(renderingEngineId);
    expect(detail.element).toBe(next.element);
    expectSameCamera(detail.camera, next.getViewState());
    expectSameCamera(detail.previousCamera, detail.camera);
  });

  it('fires one at a first mount with addDisplaySet, and none at the add of an overlay', async function () {
    const source = await createDisplaySet('addSource', 'small');
    const overlay = await createDisplaySet('addOverlay', 'large');
    const next = createNextViewport(renderingEngine);
    let recorded = recordMountEvents(next);

    await next.addDisplaySet(source);
    recorded.stop();

    expect(recorded.cameraEvents().length).toBe(1);
    expectSameCamera(
      recorded.cameraEvents()[0].detail.camera,
      next.getViewState()
    );

    recorded = recordMountEvents(next);
    await next.addDisplaySet(overlay, { role: 'overlay' });
    recorded.stop();

    expect(recorded.cameraEvents().length).toBe(0);
  });

  it('fires none at a setDisplaySets of the same data that keeps the camera, and one at a mount that changes it: a camera changed since, or other data', async function () {
    const small = await createDisplaySet('remountSmall', 'small');
    const large = await createDisplaySet('remountLarge', 'large');
    const next = createNextViewport(renderingEngine);

    await next.setDisplaySets({ displaySetId: small });

    let recorded = recordMountEvents(next);

    await next.setDisplaySets({ displaySetId: small });
    recorded.stop();

    expect(recorded.cameraEvents().length).toBe(0);
    expect(recorded.events.length).toBe(1);

    next.setZoom(2);
    recorded = recordMountEvents(next);
    await next.setDisplaySets({ displaySetId: small });
    recorded.stop();

    expect(recorded.cameraEvents().length).toBe(1);
    expect(next.getZoom()).toBeCloseTo(1, 6);
    expectSameCamera(
      recorded.cameraEvents()[0].detail.previousCamera,
      next.getViewState()
    );

    const smallCamera = next.getViewState();

    recorded = recordMountEvents(next);
    await next.setDisplaySets({ displaySetId: large });
    recorded.stop();

    expect(recorded.cameraEvents().length).toBe(1);

    const { detail } = recorded.cameraEvents()[0];

    expect(detail.camera.parallelScale).not.toBeCloseTo(
      smallCamera.parallelScale,
      2
    );
    expectSameCamera(detail.camera, next.getViewState());
    expectSameCamera(detail.previousCamera, detail.camera);
  });

  it('fires no CAMERA_MODIFIED at its mount with suppressEvents in the options', async function () {
    const displaySetId = await createDisplaySet('suppressed', 'small');
    const next = createNextViewport(renderingEngine, { suppressEvents: true });
    const recorded = recordMountEvents(next);

    await next.setDisplaySets({ displaySetId });
    recorded.stop();

    expect(recorded.cameraEvents().length).toBe(0);
  });

  it('draws its first mount in one frame', async function () {
    const displaySetId = await createDisplaySet('frames', 'small');
    const next = createNextViewport(renderingEngine);
    const stop = countFrames(next);

    await next.setDisplaySets({ displaySetId });
    await waitFrames(4);

    expect(stop()).toBe(1);
  });
});
