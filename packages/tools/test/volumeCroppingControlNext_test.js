import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, volumeLoader } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const { VolumeCroppingControlTool, ToolGroupManager, annotation } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'volumeCroppingControlNext';
const viewportIds = ['AXIAL', 'SAGITTAL', 'CORONAL'];
const toolName = VolumeCroppingControlTool.toolName;

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
 * Makes three direct next planar viewports of 256 by 256 pixels, one for
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
      viewportType: ViewportType.PLANAR_NEXT,
      width: 256,
      height: 256,
      viewportId: viewportIds[index],
      orientation,
    })),
    3
  );
}

/**
 * Makes a tool group with the three viewports and sets the cropping control
 * tool active on it.
 */
function activateCroppingControl() {
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(toolName);
  viewportIds.forEach((viewportId) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });
  toolGroup.setToolActive(toolName, { bindings: [{ mouseButton: 1 }] });

  return toolGroup;
}

/** Shows the volume on the three viewports. */
async function showVolume(renderingEngine) {
  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
  await testUtils.setVolumesOnNextViewports(
    renderingEngine,
    [volumeId],
    viewportIds
  );
}

/** The ids of the viewports that have an annotation of the tool, sorted. */
function getAnnotatedViewportIds(element) {
  return (annotation.state.getAnnotations(toolName, element) || [])
    .map(({ data }) => data.viewportId)
    .sort();
}

describe('VolumeCroppingControlTool on direct next planar viewports -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
      tools: [VolumeCroppingControlTool],
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

    expect(activateCroppingControl).not.toThrow();
    expect(getAnnotatedViewportIds(elements[0])).toEqual([]);
  });

  it('starts on each viewport when the volumes are shown after the tool is active, with no reset of a camera', async function () {
    const elements = createEmptyViewports(renderingEngine);

    try {
      activateCroppingControl();
    } catch (error) {
      fail(error);
    }

    await showVolume(renderingEngine);

    expect(getAnnotatedViewportIds(elements[0])).toEqual(
      [...viewportIds].sort()
    );
  });

  it('starts on each viewport when it is set active on viewports that show a volume', async function () {
    const elements = createEmptyViewports(renderingEngine);

    await showVolume(renderingEngine);
    activateCroppingControl();

    expect(getAnnotatedViewportIds(elements[0])).toEqual(
      [...viewportIds].sort()
    );
  });

  it('takes a reset of the view of one viewport: it resets the views once, without a throw, and each viewport keeps its annotation', async function () {
    const elements = createEmptyViewports(renderingEngine);

    await showVolume(renderingEngine);
    activateCroppingControl();

    const tool =
      ToolGroupManager.getToolGroup(toolGroupId).getToolInstance(toolName);
    const resetSpy = spyOn(tool, 'resetCroppingSpheres').and.callThrough();
    const sagittal = renderingEngine.getViewport(viewportIds[1]);

    sagittal.setViewState({ scale: [2, 2] });
    expect(() => sagittal.resetViewState()).not.toThrow();

    expect(resetSpy.calls.count()).toBe(1);
    expect(sagittal.getViewState().scale).toEqual([1, 1]);
    expect(getAnnotatedViewportIds(elements[0])).toEqual(
      [...viewportIds].sort()
    );
  });
});
