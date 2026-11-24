import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { Enums, volumeLoader, utilities, cache, viewportProjection } =
  cornerstone3D;
const { ViewportType, OrientationAxis, Events } = Enums;

const renderingEngineId = utilities.uuidv4();

/**
 * The view up of the legacy 3D viewport (`ViewportType.VOLUME_3D`, coronal,
 * the volume of the tests) after `setViewPresentation({ rotation })`, measured
 * on commit 58914567b. The rotation was absolute: the view up of the
 * orientation, [0, 0, 1], turned by the angle about the view plane normal
 * [0, -1, 0]. The focal point, the position and the parallel scale stayed,
 * and the same rotation twice gave the same camera.
 */
const LEGACY_VIEW_UP_AFTER_ROTATION = {
  0: [0, 0, 1],
  30: [-0.5, 0, 0.866],
  90: [-1, 0, 0],
};

/** Makes a direct 3D viewport of 400 by 300 pixels, coronal by default. */
function createViewport(
  renderingEngine,
  orientation = OrientationAxis.CORONAL
) {
  testUtils.createViewports(renderingEngine, {
    viewportId: 'rotation3D',
    viewportType: ViewportType.VOLUME_3D,
    orientation,
    width: 400,
    height: 300,
    useEnableElement: true,
  });

  return renderingEngine.getViewport('rotation3D');
}

/** Renders the viewport and resolves at its next IMAGE_RENDERED event. */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/** Shows a volume of 40 columns, 30 rows and 12 slices 1 mm apart. */
async function showVolume(viewport) {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'rotation3D',
    id: 'rotation3D',
    rows: 30,
    columns: 40,
    slices: 12,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  cornerstone3D.displaySetRegistry.add('rotation3D', {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId: 'rotation3D',
    options: { renderMode: 'vtkVolume3d' },
  });
  await renderAndWait(viewport);
}

/**
 * Applies a rotation as the example `volumeViewport3D` does: the view state of
 * the projection with the rotation, written with `setViewState`.
 */
async function applyRotation(viewport, rotation) {
  const viewState = viewportProjection.withFraming(viewport, {
    rotation,
  });

  viewport.setViewState(viewState);
  await renderAndWait(viewport);
}

/** Expects two vectors to be equal to three decimals. */
function expectVector(actual, expected) {
  expect(actual.length).toBe(3);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], 3)
  );
}

describe('Rotation of a 3D viewport through the projection -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
    cornerstone3D.displaySetRegistry.clear?.();
  });

  it('turns the view up about the view plane normal to the rotation, from the view up of the orientation, as the legacy viewport did', async function () {
    const viewport = createViewport(renderingEngine);

    await showVolume(viewport);

    const before = viewport.getViewState();

    expectVector(before.viewUp, LEGACY_VIEW_UP_AFTER_ROTATION[0]);

    for (const rotation of [90, 90, 30, 0]) {
      await applyRotation(viewport, rotation);

      const after = viewport.getViewState();

      expectVector(after.viewUp, LEGACY_VIEW_UP_AFTER_ROTATION[rotation]);
      expectVector(after.viewPlaneNormal, before.viewPlaneNormal);
      expectVector(after.focalPoint, before.focalPoint);
      expectVector(after.position, before.position);
      expect(after.parallelScale).toBeCloseTo(before.parallelScale, 6);
    }
  });

  it('reads back the rotation that was applied', async function () {
    const viewport = createViewport(renderingEngine);

    await showVolume(viewport);
    await applyRotation(viewport, 30);

    expect(viewportProjection.getFraming(viewport).rotation).toBeCloseTo(30, 4);

    await applyRotation(viewport, 300);

    expect(viewportProjection.getFraming(viewport).rotation).toBeCloseTo(
      300,
      4
    );
  });

  [
    { name: 'no orientation', orientation: null },
    { name: 'the acquisition plane', orientation: OrientationAxis.ACQUISITION },
  ].forEach(({ name, orientation }) => {
    it(`gives the same camera for the same rotation twice, and reads it back, with ${name}`, async function () {
      const viewport = createViewport(renderingEngine, orientation);

      await showVolume(viewport);

      const before = viewport.getViewState();

      await applyRotation(viewport, 90);

      const once = viewport.getViewState();

      await applyRotation(viewport, 90);

      const twice = viewport.getViewState();

      expectVector(twice.viewUp, once.viewUp);
      expectVector(twice.viewPlaneNormal, before.viewPlaneNormal);
      expect(viewportProjection.getFraming(viewport).rotation).toBeCloseTo(
        90,
        4
      );

      await applyRotation(viewport, 0);

      expectVector(viewport.getViewState().viewUp, before.viewUp);
    });
  });

  it('keeps the camera of a presentation that was read, with its rotation', async function () {
    const viewport = createViewport(renderingEngine);

    await showVolume(viewport);
    await applyRotation(viewport, 90);

    const presentation = viewportProjection.getFraming(viewport);

    await applyRotation(viewport, 30);
    viewport.setViewState(
      viewportProjection.withFraming(viewport, presentation)
    );

    expectVector(
      viewport.getViewState().viewUp,
      LEGACY_VIEW_UP_AFTER_ROTATION[90]
    );
  });

  [
    { name: 'the coronal orientation', orientation: OrientationAxis.CORONAL },
    { name: 'no orientation', orientation: null },
  ].forEach(({ name, orientation }) => {
    it(`gives the same camera for the same rotation twice, and reads it back, when the camera looks along the view up of rotation 0, with ${name}`, async function () {
      const viewport = createViewport(renderingEngine, orientation);

      await showVolume(viewport);

      const mounted = viewport.getViewState();
      const distance = Math.hypot(
        ...mounted.position.map(
          (value, index) => value - mounted.focalPoint[index]
        )
      );

      viewport.setViewState({
        viewUp: mounted.viewPlaneNormal.map((value) => -value),
        viewPlaneNormal: mounted.viewUp,
        position: mounted.focalPoint.map(
          (value, index) => value + distance * mounted.viewUp[index]
        ),
        focalPoint: mounted.focalPoint,
      });
      await renderAndWait(viewport);

      const atThePole = viewport.getViewState();
      const rotationAtThePole =
        viewportProjection.getFraming(viewport).rotation;

      expectVector(atThePole.viewPlaneNormal, mounted.viewUp);
      expect(Math.min(rotationAtThePole, 360 - rotationAtThePole)).toBeCloseTo(
        0,
        4
      );

      await applyRotation(viewport, 30);

      const once = viewport.getViewState();

      await applyRotation(viewport, 30);

      const twice = viewport.getViewState();

      expectVector(twice.viewUp, once.viewUp);
      expectVector(twice.viewPlaneNormal, mounted.viewUp);
      expect(viewportProjection.getFraming(viewport).rotation).toBeCloseTo(
        30,
        4
      );
    });
  });
});
