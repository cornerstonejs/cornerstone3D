import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, volumeLoader } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const {
  CrosshairsTool,
  ToolGroupManager,
  annotation,
  Enums: csToolsEnums,
} = csTools3d;
const { Events: csToolsEvents } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'crosshairsNext';
const viewportIds = ['AXIAL', 'SAGITTAL', 'CORONAL'];

const volumeId = testUtils.encodeVolumeIdInfo({
  loader: 'fakeVolumeLoader',
  name: 'volumeURI',
  rows: 100,
  columns: 100,
  slices: 10,
  xSpacing: 1,
  ySpacing: 1,
});

/**
 * Makes three direct next planar viewports of 512 by 128 pixels, one for
 * each patient axis. They show nothing yet.
 */
function createEmptyViewports(renderingEngine) {
  return testUtils.createViewports(
    renderingEngine,
    [
      OrientationAxis.AXIAL,
      OrientationAxis.SAGITTAL,
      OrientationAxis.CORONAL,
    ].map((orientation, index) => ({
      viewportType: ViewportType.PLANAR,
      width: 512,
      height: 128,
      viewportId: viewportIds[index],
      orientation,
    })),
    3
  );
}

/**
 * Makes a tool group with the three viewports and sets the crosshairs tool
 * active on it, as an application that starts its tools before the data
 * comes.
 */
function activateCrosshairs() {
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(CrosshairsTool.toolName, { volumeId });
  viewportIds.forEach((viewportId) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });
  toolGroup.setToolActive(CrosshairsTool.toolName, {
    bindings: [{ mouseButton: 1 }],
  });

  return toolGroup;
}

/** Resolves when the annotations of each element are drawn once more. */
function waitForAnnotationsRendered(elements) {
  return Promise.all(
    elements.map(
      (element) =>
        new Promise((resolve) => {
          element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, resolve, {
            once: true,
          });
        })
    )
  );
}

/** The crosshairs annotations of the frame of reference of an element. */
function getCrosshairsAnnotations(element) {
  return (
    annotation.state.getAnnotations(CrosshairsTool.toolName, element) || []
  );
}

describe('CrosshairsTool on a direct next planar viewport -- ', () => {
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

  it('is set active on viewports that show nothing yet, without a throw and without an annotation', function () {
    const elements = createEmptyViewports(renderingEngine);

    expect(activateCrosshairs).not.toThrow();
    elements.forEach((element) => {
      expect(getCrosshairsAnnotations(element).length).toBe(0);
    });
  });

  it('starts at the middle of the volume and draws on each viewport when the volumes are shown after the tool is active', async function () {
    const elements = createEmptyViewports(renderingEngine);
    const toolGroup = activateCrosshairs();
    const annotationsRendered = waitForAnnotationsRendered(elements);

    await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
    await testUtils.setVolumesOnNextViewports(
      renderingEngine,
      [volumeId],
      viewportIds
    );
    renderingEngine.render();
    await annotationsRendered;

    const { imageData } = renderingEngine
      .getViewport(viewportIds[0])
      .getImageData();
    const middle = imageData.indexToWorld(
      imageData.getDimensions().map((size) => Math.floor(size / 2))
    );
    const crosshairsAnnotations = getCrosshairsAnnotations(elements[0]);
    const { toolCenter } = toolGroup.getToolInstance(CrosshairsTool.toolName);

    expect(
      crosshairsAnnotations.map(({ data }) => data.viewportId).sort()
    ).toEqual([...viewportIds].sort());
    middle.forEach((value, axis) => {
      expect(toolCenter[axis]).toBeCloseTo(value, 3);
    });
    crosshairsAnnotations.forEach(({ data }) => {
      data.handles.toolCenter.forEach((value, axis) => {
        expect(value).toBeCloseTo(middle[axis], 3);
      });
    });
  });

  it('starts on the viewports that show a volume while another viewport of the tool group shows nothing', async function () {
    const elements = createEmptyViewports(renderingEngine);

    activateCrosshairs();
    await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
    await testUtils.setVolumesOnNextViewports(
      renderingEngine,
      [volumeId],
      viewportIds.slice(0, 2)
    );

    expect(
      getCrosshairsAnnotations(elements[0])
        .map(({ data }) => data.viewportId)
        .sort()
    ).toEqual(viewportIds.slice(0, 2).sort());
    expect(getCrosshairsAnnotations(elements[2]).length).toBe(0);
  });
});
