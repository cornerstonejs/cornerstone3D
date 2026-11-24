import * as cornerstone3D from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  TILTED_PLANE,
  createNextViewport,
  createSeries,
  expectPointsClose,
  showStack,
  showVolume,
} from './utils/planarSeriesBothModes';

const { Enums, volumeLoader, utilities, cache } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;

const renderingEngineId = utilities.uuidv4();
const SQRT_HALF = Math.sqrt(0.5);

/**
 * Makes a viewport of a type, axial and of the size of the tests, in the
 * rendering engine.
 */
function createViewport(renderingEngine, viewportId, viewportType) {
  testUtils.createViewports(renderingEngine, {
    orientation: OrientationAxis.AXIAL,
    width: 120,
    height: 120,
    useEnableElement: true,
    viewportId,
    viewportType,
  });

  return renderingEngine.getViewport(viewportId);
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

  cornerstone3D.displaySetRegistry.add(displaySetId, {
    imageIds: cache.getVolume(volumeId).imageIds,
    volumeId,
  });
  await viewport.setDisplaySets({
    displaySetId,
    options: { orientation: OrientationAxis.AXIAL, mode: 'volume' },
  });
}

function expectClose(actual, expected) {
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 5);
  });
}

describe('setOrientation with vectors against the legacy volume viewport -- ', () => {
  let renderingEngine;
  let volumeId;
  let next;

  beforeEach(async function () {
    const testEnv = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    renderingEngine = testEnv.renderingEngine;
    next = createViewport(renderingEngine, 'next', ViewportType.PLANAR);
    volumeId = await createVolume();
    await showVolumeOnNext(next, volumeId);
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: ['default'],
    });
    cornerstone3D.displaySetRegistry.clear?.();
  });

  it('gives on a direct next viewport the same view by setOrientation and by setViewState, for both vectors and for a normal alone', function () {
    const inputs = [
      { viewPlaneNormal: [SQRT_HALF, SQRT_HALF, 0], viewUp: [0, 0, 1] },
      { viewPlaneNormal: [1, 0, 0] },
    ];

    inputs.forEach((orientation) => {
      next.setOrientation(OrientationAxis.AXIAL);
      next.setOrientation(orientation);

      const bySetOrientation = next.getResolvedView().toICamera();
      const stateBySetOrientation = next.getViewState().orientation;

      next.setOrientation(OrientationAxis.AXIAL);
      next.setViewState({ orientation });

      const bySetViewState = next.getResolvedView().toICamera();

      expectClose(
        bySetOrientation.viewPlaneNormal,
        orientation.viewPlaneNormal
      );
      expectClose(
        bySetViewState.viewPlaneNormal,
        bySetOrientation.viewPlaneNormal
      );
      expectClose(bySetViewState.viewUp, bySetOrientation.viewUp);
      expect(next.getViewState().orientation).toEqual(stateBySetOrientation);
    });
  });

  it('throws on a direct next viewport for a view up that is not orthogonal to the normal, by setOrientation and by setViewState', function () {
    const orientation = { viewPlaneNormal: [0, 0, -1], viewUp: [0, -1, 0.5] };

    expect(() => next.setOrientation(orientation)).toThrowError(
      /must be orthogonal/
    );
    expect(() => next.setViewState({ orientation })).toThrowError(
      /must be orthogonal/
    );
  });
});

describe('One rule for the orientation of a direct next planar viewport -- ', () => {
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
    cornerstone3D.displaySetRegistry.clear?.();
  });

  /** The view vectors of the view on display. */
  function getView(viewport) {
    const { viewPlaneNormal, viewUp } = viewport.getResolvedView().toICamera();

    return { viewPlaneNormal, viewUp };
  }

  [
    OrientationAxis.SAGITTAL_REFORMAT,
    OrientationAxis.CORONAL_REFORMAT,
    OrientationAxis.REFORMAT,
    OrientationAxis.SAGITTAL,
  ].forEach((orientation) => {
    it(`gives the same view for ${orientation} in volume mode by the option of the display set, by setOrientation and by setViewState`, async function () {
      const series = await createSeries({ plane: TILTED_PLANE });
      const byOption = createNextViewport(renderingEngine, 'byOption');
      const bySetOrientation = createNextViewport(
        renderingEngine,
        'bySetOrientation'
      );
      const bySetViewState = createNextViewport(
        renderingEngine,
        'bySetViewState'
      );

      await showVolume(byOption, series, 3, { orientation });
      await showVolume(bySetOrientation, series, 3);
      await showVolume(bySetViewState, series, 3);
      bySetOrientation.setOrientation(orientation);
      bySetViewState.setViewState({ orientation });

      const expected = getView(byOption);

      [byOption, bySetOrientation, bySetViewState].forEach((viewport) => {
        const view = getView(viewport);

        expect(viewport.getCurrentMode()).toBe('volume');
        expect(viewport.canRenderOrientation(orientation)).toBe(true);
        expectPointsClose(view.viewPlaneNormal, expected.viewPlaneNormal);
        expectPointsClose(view.viewUp, expected.viewUp);
      });
      expect(bySetViewState.getViewState().orientation).toEqual(
        bySetOrientation.getViewState().orientation
      );
    });
  });

  it('leaves the view of a stack as it is, without a throw, and says that a stack renders its acquisition only', async function () {
    const series = await createSeries({ plane: TILTED_PLANE });
    const viewport = createNextViewport(renderingEngine, 'stack');

    await showStack(viewport, series, 3);

    const before = getView(viewport);

    [
      OrientationAxis.SAGITTAL,
      OrientationAxis.SAGITTAL_REFORMAT,
      OrientationAxis.REFORMAT,
      { viewPlaneNormal: [1, 0, 0], viewUp: [0, 0, 1] },
    ].forEach((orientation) => {
      expect(() => viewport.setOrientation(orientation)).not.toThrow();
      expect(() => viewport.setViewState({ orientation })).not.toThrow();

      const view = getView(viewport);

      expect(viewport.getCurrentMode()).toBe('stack');
      expect(viewport.getCurrentImageId()).toBe(series.imageIds[3]);
      expect(viewport.getViewState().orientation).toBe(
        OrientationAxis.ACQUISITION
      );
      expect(viewport.canRenderOrientation(orientation)).toBe(false);
      expectPointsClose(view.viewPlaneNormal, before.viewPlaneNormal);
      expectPointsClose(view.viewUp, before.viewUp);
    });

    expect(viewport.canRenderOrientation(OrientationAxis.ACQUISITION)).toBe(
      true
    );
  });
});
