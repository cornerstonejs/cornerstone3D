import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, volumeLoader } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const { CrosshairsTool, ToolGroupManager, Enums: csToolsEnums } = csTools3d;
const { Events: csToolsEvents } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'resetKeepOrientationNext';
const viewportIds = ['AXIAL', 'SAGITTAL', 'CORONAL'];

/** A view of the axial viewport turned by about 37 degrees about the x axis. */
const OBLIQUE = {
  viewPlaneNormal: [0, 0.6, -0.8],
  viewUp: [0, -0.8, -0.6],
};

/** A volume of 64 by 64 voxels of 1 mm and 20 slices. */
async function createVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    rows: 64,
    columns: 64,
    slices: 20,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/**
 * Makes three direct next planar viewports of 400 by 400 pixels with an
 * axial, a sagittal and a coronal orientation in their options, and returns
 * them.
 */
function createViewports(renderingEngine) {
  testUtils.createViewports(
    renderingEngine,
    [
      OrientationAxis.AXIAL,
      OrientationAxis.SAGITTAL,
      OrientationAxis.CORONAL,
    ].map((orientation, index) => ({
      viewportType: ViewportType.PLANAR,
      viewportId: viewportIds[index],
      orientation,
    }))
  );

  return viewportIds.map((viewportId) =>
    renderingEngine.getViewport(viewportId)
  );
}

/** Checks that two world vectors are the same, to a thousandth. */
function expectVectorsToBeClose(actual, expected) {
  [0, 1, 2].forEach((axis) => {
    expect(actual[axis]).toBeCloseTo(expected[axis], 3);
  });
}

/**
 * The distance of the slice on display from the world origin along the view
 * plane normal: it tells which slice of a volume a viewport shows.
 */
function depthOfSlice(viewport) {
  const { viewPlaneNormal } = viewport.getViewReference();
  const centre = viewport.canvasToWorld([200, 200]);

  return [0, 1, 2].reduce(
    (sum, axis) => sum + centre[axis] * viewPlaneNormal[axis],
    0
  );
}

/** Pans, zooms and scrolls a viewport away from its fit. */
async function moveAwayFromFit(viewport) {
  viewport.setPan([30, -20]);
  viewport.setZoom(2);
  await viewport.scroll(3);
  expect(viewport.getZoom()).toBeCloseTo(2, 6);
}

/** Checks that the zoom and the pan of a viewport are those of its fit. */
function expectFitZoomAndPan(viewport) {
  expect(viewport.getZoom()).toBeCloseTo(1, 6);
  expect(viewport.getPan()[0]).toBeCloseTo(0, 3);
  expect(viewport.getPan()[1]).toBeCloseTo(0, 3);
}

describe('resetViewState with resetOrientation false on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
      tools: [CrosshairsTool],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('keeps an orientation of the view state in volume mode, and brings the zoom and the pan back to the fit, on the slice on display', async function () {
    const [viewport] = createViewports(renderingEngine);

    await testUtils.setVolumesOnNextViewport(viewport, [await createVolume()]);
    viewport.setViewState({ orientation: OBLIQUE });
    await moveAwayFromFit(viewport);

    const depth = depthOfSlice(viewport);

    viewport.resetViewState({ resetOrientation: false });

    expect(viewport.getViewState().orientation).toEqual(OBLIQUE);
    expectVectorsToBeClose(
      viewport.getViewReference().viewPlaneNormal,
      OBLIQUE.viewPlaneNormal
    );
    expectVectorsToBeClose(viewport.getViewReference().viewUp, OBLIQUE.viewUp);
    expectFitZoomAndPan(viewport);
    expect(depthOfSlice(viewport)).toBeCloseTo(depth, 3);
  });

  it('changes no orientation in stack mode, and brings the zoom and the pan back to the fit, on the image on display', async function () {
    const [viewport] = createViewports(renderingEngine);
    const imageIds = [0, 1, 2, 3, 4].map((sliceIndex) =>
      testUtils.encodeImageIdInfo({
        loader: 'fakeImageLoader',
        name: 'imageURI',
        rows: 64,
        columns: 64,
        barStart: 10,
        barWidth: 5,
        xSpacing: 1,
        ySpacing: 1,
        sliceIndex,
      })
    );

    await testUtils.setStackOnNextViewport(viewport, imageIds, 1);

    const { viewPlaneNormal, viewUp } = viewport.getViewReference();

    await moveAwayFromFit(viewport);
    viewport.resetViewState({ resetOrientation: false });

    expect(viewport.getCurrentMode()).toBe('stack');
    expect(viewport.getViewState().orientation).toBe(
      OrientationAxis.ACQUISITION
    );
    expectVectorsToBeClose(
      viewport.getViewReference().viewPlaneNormal,
      viewPlaneNormal
    );
    expectVectorsToBeClose(viewport.getViewReference().viewUp, viewUp);
    expectFitZoomAndPan(viewport);
    expect(viewport.getCurrentImageIdIndex()).toBe(4);
  });

  describe('with the crosshairs tool on the viewports', () => {
    /**
     * Shows the volume on the three viewports with the crosshairs tool
     * active on them, as the example `mprReformat`, and resolves when the
     * crosshairs are drawn.
     */
    async function createCrosshairsScene() {
      const viewports = createViewports(renderingEngine);
      const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
      const volumeId = await createVolume();

      toolGroup.addTool(CrosshairsTool.toolName, { volumeId });
      viewportIds.forEach((viewportId) => {
        toolGroup.addViewport(viewportId, renderingEngineId);
      });
      toolGroup.setToolActive(CrosshairsTool.toolName, {
        bindings: [{ mouseButton: 1 }],
      });

      const rendered = Promise.all(
        viewports.map(
          ({ element }) =>
            new Promise((resolve) => {
              element.addEventListener(
                csToolsEvents.ANNOTATION_RENDERED,
                resolve,
                { once: true }
              );
            })
        )
      );

      await testUtils.setVolumesOnNextViewports(
        renderingEngine,
        [volumeId],
        viewportIds
      );
      renderingEngine.render();
      await rendered;

      return viewports;
    }

    it('keeps the orientation of the viewport that is reset, where the crosshairs answer the reset', async function () {
      const [axial, sagittal, coronal] = await createCrosshairsScene();

      axial.setViewState({ orientation: OBLIQUE });
      await moveAwayFromFit(axial);
      axial.resetViewState({ resetOrientation: false });

      expect(axial.getViewState().orientation).toEqual(OBLIQUE);
      expectVectorsToBeClose(
        axial.getViewReference().viewPlaneNormal,
        OBLIQUE.viewPlaneNormal
      );
      expectFitZoomAndPan(axial);
      expect(sagittal.getViewState().orientation).toBe(
        OrientationAxis.SAGITTAL
      );
      expect(coronal.getViewState().orientation).toBe(OrientationAxis.CORONAL);
    });

    it('still takes the orientation back with a reset of every field', async function () {
      const [axial] = await createCrosshairsScene();

      axial.setViewState({ orientation: OBLIQUE });
      axial.resetViewState();

      expect(axial.getViewState().orientation).toBe(OrientationAxis.AXIAL);
      expectVectorsToBeClose(
        axial.getViewReference().viewPlaneNormal,
        [0, 0, -1]
      );
      expectFitZoomAndPan(axial);
    });
  });
});
