import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, metaData, Enums } = cornerstone3D;
const { UltrasoundPleuraBLineTool } = csTools3d;
const { triggerAnnotationRenderForViewportIds } = csTools3d.utilities;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'usPleuraBLineBeforeImage';
const viewportId = 'usPleuraBLineBeforeImage';
const FAN_GEOMETRY = {
  center: [32, 4],
  innerRadius: 10,
  outerRadius: 50,
  startAngle: 45,
  endAngle: 135,
};

const imageIds = Array.from({ length: 3 }, (_, sliceIndex) =>
  testUtils.encodeImageIdInfo({
    loader: 'fakeImageLoader',
    name: 'usPleuraBLine',
    id: 'usPleuraBLine',
    rows: 64,
    columns: 64,
    barStart: 16,
    barWidth: 8,
    xSpacing: 1,
    ySpacing: 1,
    sliceIndex,
  })
);

/** Gives the fan of the images of the test as their ultrasound metadata. */
function fanGeometryProvider(type, imageId) {
  if (type === 'ultrasoundFanShapeGeometry' && imageIds.includes(imageId)) {
    return FAN_GEOMETRY;
  }
}

/** Resolves after two animation frames, when an annotation render is done. */
function nextFrames() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );
}

describe('UltrasoundPleuraBLineTool on a direct next planar viewport before its first image -- ', () => {
  let renderingEngine;
  let toolGroup;
  let errors;

  const onError = (event) => {
    errors.push(event.error?.message ?? event.message);
  };

  beforeEach(function () {
    const environment = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [UltrasoundPleuraBLineTool],
      viewportIds: [viewportId],
    });

    renderingEngine = environment.renderingEngine;
    toolGroup = environment.toolGroups[toolGroupId];
    metaData.addProvider(fanGeometryProvider, 20000);
    errors = [];
    window.addEventListener('error', onError);
  });

  afterEach(function () {
    window.removeEventListener('error', onError);
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('renders nothing and throws nothing until the first image is drawn, then finds the fan of that image', async function () {
    testUtils.createViewports(renderingEngine, {
      viewportType: Enums.ViewportType.PLANAR,
      viewportId,
    });

    const viewport = renderingEngine.getViewport(viewportId);
    const tool = toolGroup.getToolInstance(UltrasoundPleuraBLineTool.toolName);

    toolGroup.setToolEnabled(UltrasoundPleuraBLineTool.toolName);
    triggerAnnotationRenderForViewportIds([viewportId]);
    await nextFrames();

    expect(viewport.getCurrentImageId()).toBeUndefined();
    expect(tool.getFanShapeGeometryParameters(viewport)).toBe(false);
    expect(errors).toEqual([]);

    const mounted = testUtils.setStackOnNextViewport(viewport, imageIds, 0);

    expect(viewport.getCurrentImageId()).toBeUndefined();
    expect(tool.getFanShapeGeometryParameters(viewport)).toBe(false);
    triggerAnnotationRenderForViewportIds([viewportId]);
    await mounted;
    await nextFrames();

    expect(errors).toEqual([]);
    expect(viewport.getCurrentImageId()).toBe(imageIds[0]);
    expect(tool.getFanShapeGeometryParameters(viewport)).toBe(true);
    expect(tool.configuration.center).toEqual([32, 4, 0]);
    expect(tool.configuration.outerRadius).toBe(50);
  });
});
