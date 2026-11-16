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

describe('Options of the direct next 3D viewport -- ', () => {
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

  /**
   * Makes one 3D viewport with these options: the legacy class when `legacy`
   * is set, else the direct next class.
   */
  function createViewport(viewportId, { legacy = false, ...options } = {}) {
    const rendering = getConfiguration().rendering;
    const useGenericViewport = rendering.useGenericViewport;

    if (legacy) {
      rendering.useGenericViewport = false;
    }
    testUtils.createViewports(renderingEngine, {
      orientation: OrientationAxis.SAGITTAL,
      width: 400,
      height: 300,
      useEnableElement: true,
      viewportId,
      viewportType: legacy
        ? ViewportType.VOLUME_3D
        : ViewportType.VOLUME_3D_NEXT,
      ...options,
    });
    rendering.useGenericViewport = useGenericViewport;

    return renderingEngine.getViewport(viewportId);
  }

  /** Renders a viewport and gives the colour of the pixel at its corner. */
  async function cornerPixel(viewport) {
    const rendered = new Promise((resolve) =>
      viewport.element.addEventListener(
        cornerstone3D.Enums.Events.IMAGE_RENDERED,
        resolve,
        { once: true }
      )
    );

    viewport.render();
    await rendered;

    return Array.from(
      viewport.canvas.getContext('2d').getImageData(2, 2, 1, 1).data
    ).slice(0, 3);
  }

  it('keeps a copy of the default options as the options, as the legacy viewport', function () {
    const legacy = createViewport('legacy3D', {
      legacy: true,
      background: [0, 0, 1],
    });
    const next = createViewport('next3D', { background: [0, 0, 1] });

    expect(next.defaultOptions).toEqual(legacy.defaultOptions);
    expect(next.options).toEqual(legacy.options);
    expect(next.options).not.toBe(next.defaultOptions);

    legacy.setOptions({ background: [1, 0, 0] });
    next.setOptions({ background: [1, 0, 0] });

    expect(next.options).toEqual(legacy.options);

    legacy.reset();
    next.reset();

    expect(next.options).toEqual(legacy.options);
    expect(next.options).toEqual(next.defaultOptions);
  });

  it('turns to the orientation of setOptions as a viewport made with it, and back on reset', async function () {
    const legacy = createViewport('legacy3D', { legacy: true });
    const made = createViewport('madeAxial', {
      orientation: OrientationAxis.AXIAL,
    });
    const changed = createViewport('changed3D');
    const volumeId = await createVolume();

    await legacy.setVolumes([{ volumeId }]);
    await showVolume(made, volumeId);
    await showVolume(changed, volumeId);

    changed.setOptions({
      ...changed.options,
      orientation: OrientationAxis.AXIAL,
    });

    expectSameCamera(changed.getViewState(), made.getViewState());

    changed.reset();

    expectSameCamera(changed.getViewState(), legacy.getCamera());
  });

  it('draws the background of setOptions as a viewport made with it, and the default one after reset', async function () {
    const legacy = createViewport('legacy3D', {
      legacy: true,
      background: [1, 0, 0],
    });
    const made = createViewport('madeRed', { background: [1, 0, 0] });
    const changed = createViewport('changed3D');
    const volumeId = await createVolume();

    await legacy.setVolumes([{ volumeId }]);
    await showVolume(made, volumeId);
    await showVolume(changed, volumeId);

    const defaultPixel = await cornerPixel(changed);

    expect(await cornerPixel(made)).toEqual(await cornerPixel(legacy));

    changed.setOptions({ ...changed.options, background: [1, 0, 0] }, true);

    expect(await cornerPixel(changed)).toEqual(await cornerPixel(made));

    changed.reset(true);

    expect(await cornerPixel(changed)).toEqual(defaultPixel);
  });
});
