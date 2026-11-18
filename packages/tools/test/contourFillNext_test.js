import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import {
  createNextPlanarViewport,
  showVolumeWithLabelmap,
  showStackWithLabelmap,
  canvasToIndex,
} from './nextLabelmapScenes';

const { utilities } = cornerstone3D;
const { BrushTool, PlanarFreehandROITool, annotation } = csTools3d;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'contourFillNext';
const segmentationId = 'contourFillNextSegmentation';

/**
 * Adds a closed contour to the annotation state: the square of the canvas
 * from 150 to 250 pixels on both axes, on the slice that the viewport shows.
 */
function addSquareContour(viewport) {
  const polyline = [
    [150, 150],
    [250, 150],
    [250, 250],
    [150, 250],
  ].map((canvasPoint) => viewport.canvasToWorld(canvasPoint));
  const { viewPlaneNormal, viewUp } = viewport.getViewReference();

  annotation.state.addAnnotation(
    {
      highlighted: false,
      invalidated: false,
      isVisible: true,
      metadata: {
        toolName: PlanarFreehandROITool.toolName,
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: viewport.getCurrentImageId(),
        viewPlaneNormal,
        viewUp,
      },
      data: {
        handles: { points: [], activeHandleIndex: null },
        contour: { polyline, closed: true },
      },
    },
    viewport.element
  );
}

describe('The contour fill of the brush on a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [],
      tools: [BrushTool, PlanarFreehandROITool],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('fills the labelmap inside a contour of the slice shown, in volume mode', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const { voxelManager, imageData } = await showVolumeWithLabelmap(
      viewport,
      segmentationId
    );

    expect(viewport.getCurrentMode()).toBe('volume');
    addSquareContour(viewport);

    const inside = canvasToIndex(viewport, imageData, [200, 200]);
    const outside = canvasToIndex(viewport, imageData, [100, 100]);

    expect(voxelManager.getAtIJKPoint(inside)).toBe(0);
    BrushTool.viewportContoursToLabelmap(viewport);

    expect(voxelManager.getAtIJKPoint(inside)).toBe(1);
    expect(voxelManager.getAtIJKPoint(outside)).toBe(0);
    expect(
      voxelManager.getAtIJKPoint([inside[0], inside[1], inside[2] + 1])
    ).toBe(0);
    expect(annotation.state.getAllAnnotations().length).toBe(0);
  });

  it('fills the labelmap inside a contour of the image shown, in stack mode', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const { voxelManager, imageData } = await showStackWithLabelmap(
      viewport,
      segmentationId
    );

    expect(viewport.getCurrentMode()).toBe('stack');
    addSquareContour(viewport);

    const inside = canvasToIndex(viewport, imageData, [200, 200]);
    const outside = canvasToIndex(viewport, imageData, [100, 100]);

    expect(voxelManager.getAtIJK(inside[0], inside[1], 0)).toBe(0);
    BrushTool.viewportContoursToLabelmap(viewport);

    expect(voxelManager.getAtIJK(inside[0], inside[1], 0)).toBe(1);
    expect(voxelManager.getAtIJK(outside[0], outside[1], 0)).toBe(0);
    expect(annotation.state.getAllAnnotations().length).toBe(0);
  });
});
