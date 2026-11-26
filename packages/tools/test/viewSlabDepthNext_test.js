import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, volumeLoader, cache, eventTarget } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const { getViewSlabDepthOfViewport, sampleAreaAnnotationVoxels } =
  csTools3d.utilities;
const {
  BrushTool,
  ToolGroupManager,
  segmentation,
  Enums: csToolsEnums,
} = csTools3d;

const renderingEngineId = utilities.uuidv4();
const viewportId = 'slabDepthNext';
const toolGroupId = 'slabDepthNextTools';
const segmentationId = 'slabDepthNextSegmentation';

/**
 * Measured on the legacy volume viewport of commit 58914567b: an axial view
 * of a volume of 100 by 100 voxels and 20 slices of 1 mm at slice 10, with
 * `setSlabThickness(slab)`. For each slab: the slices that one click of the
 * circle brush filled, the `planeRestriction.referencePlaneThickness` of the
 * view reference that a new annotation takes, and the slices that the
 * statistics of a rectangle drawn there cover. The legacy number reached
 * that far on each side of the plane, so the depth was twice the number. The
 * legacy view opened on slice 10, the middle in volume order; a next axial
 * view opens on slice 9, the middle in view order (index 10 of 20 against
 * k), so the test goes to slice 10 (index 9) first.
 */
const LEGACY_SLAB_DEPTH = {
  0: {
    brushSlices: [10],
    referencePlaneThickness: undefined,
    statisticSlices: [10],
  },
  2: {
    brushSlices: [9, 10, 11, 12],
    referencePlaneThickness: 4,
    statisticSlices: [8, 9, 10, 11, 12],
  },
  4: {
    brushSlices: [7, 8, 9, 10, 11, 12, 13, 14],
    referencePlaneThickness: 8,
    statisticSlices: [6, 7, 8, 9, 10, 11, 12, 13, 14],
  },
};

/** Makes a direct next planar viewport of 400 by 400 pixels, axial. */
function createNextViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    viewportType: ViewportType.PLANAR,
    viewportId,
  });

  return renderingEngine.getViewport(viewportId);
}

describe('The slab depth of a direct next planar viewport, as a brush reads it -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({ renderingEngineId });
  });

  it('is twice the slab thickness of the presentation of the source in volume mode, as the legacy helper gave twice the legacy slab, and undefined without a slab', async function () {
    const viewport = createNextViewport(renderingEngine);
    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 10,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
    await testUtils.setVolumesOnNextViewport(viewport, [volumeId]);

    expect(viewport.getCurrentMode()).toBe('volume');
    expect(getViewSlabDepthOfViewport(viewport)).toBeUndefined();

    viewport.setDisplaySetAppearance({ slabThickness: 5 });

    expect(getViewSlabDepthOfViewport(viewport)).toBe(10);

    viewport.setDisplaySetAppearance({ slabThickness: undefined });

    expect(getViewSlabDepthOfViewport(viewport)).toBeUndefined();
  });

  it('is undefined in stack mode', async function () {
    const viewport = createNextViewport(renderingEngine);
    const imageId = testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    });

    await testUtils.setStackOnNextViewport(viewport, [imageId], 0);

    expect(viewport.getCurrentMode()).toBe('stack');
    expect(getViewSlabDepthOfViewport(viewport)).toBeUndefined();
  });

  it('is undefined in stack mode with a slab thickness in the presentation of the stack, which draws one image', async function () {
    const viewport = createNextViewport(renderingEngine);
    const imageId = testUtils.encodeImageIdInfo({
      loader: 'fakeImageLoader',
      name: 'imageURI',
      rows: 64,
      columns: 64,
      barStart: 10,
      barWidth: 5,
      xSpacing: 1,
      ySpacing: 1,
      sliceIndex: 0,
    });

    await testUtils.setStackOnNextViewport(viewport, [imageId], 0);
    viewport.setDisplaySetAppearance(viewport.getSourceDisplaySetId(), {
      slabThickness: 5,
    });

    expect(viewport.getCurrentMode()).toBe('stack');
    expect(
      viewport.getDisplaySetAppearance(viewport.getSourceDisplaySetId())
        .slabThickness
    ).toBe(5);
    expect(getViewSlabDepthOfViewport(viewport)).toBeUndefined();
  });
});

/** Resolves after the given number of milliseconds. */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clicks the primary button at a canvas point and waits until the click has
 * passed the double click wait of the mouse listener.
 */
async function clickAt(element, canvasPoint) {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + canvasPoint[0];
  const clientY = rect.top + canvasPoint[1];
  const init = {
    buttons: 1,
    clientX,
    clientY,
    pageX: clientX,
    pageY: clientY,
    bubbles: true,
  };

  element.dispatchEvent(new MouseEvent('mousedown', init));
  document.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
  await wait(1000);
}

/** The slices of a labelmap volume that hold a segment, in order. */
function getFilledSlices(labelmap) {
  const [columns, rows, slices] = labelmap.dimensions;
  const filled = [];

  for (let k = 0; k < slices; k++) {
    let found = false;

    for (let j = 0; j < rows && !found; j++) {
      for (let i = 0; i < columns && !found; i++) {
        found = !!labelmap.voxelManager.getAtIJK(i, j, k);
      }
    }

    if (found) {
      filled.push(k);
    }
  }

  return filled;
}

/** Sets every voxel of a labelmap volume to 0. */
function clearLabelmap(labelmap) {
  const [columns, rows, slices] = labelmap.dimensions;

  for (let k = 0; k < slices; k++) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < columns; i++) {
        labelmap.voxelManager.setAtIJK(i, j, k, 0);
      }
    }
  }
}

/**
 * The slices that the statistics of a rectangle cover when it is drawn on the
 * view shown: the voxels that RectangleROITool samples, with the view
 * reference of the viewport as the metadata of the annotation.
 */
function getStatisticSlices(viewport, imageVolume) {
  const corners = [
    [150, 150],
    [250, 150],
    [150, 250],
    [250, 250],
  ].map((point) => viewport.canvasToWorld(point));
  const majorAxis = corners[1].map((value, axis) => value - corners[0][axis]);
  const minorAxis = corners[2].map((value, axis) => value - corners[0][axis]);
  const voxels = sampleAreaAnnotationVoxels({
    annotation: { metadata: viewport.getViewReference() },
    image: {
      dimensions: imageVolume.dimensions,
      direction: imageVolume.direction,
      spacing: imageVolume.spacing,
      origin: imageVolume.origin,
      imageData: imageVolume.imageData,
    },
    voxelManager: imageVolume.voxelManager,
    points: corners,
    minimumPoints: 4,
    storePointData: true,
    createShape: ({ volume, planePoint, viewPlaneNormal }) =>
      utilities.voxelSlab.createRectangleShape({
        volume,
        planePoint,
        viewPlaneNormal,
        centerWorld: corners[0].map(
          (value, axis) => (value + corners[3][axis]) / 2
        ),
        majorAxis,
        majorHalfLength: Math.hypot(...majorAxis) / 2,
        minorHalfLength: Math.hypot(...minorAxis) / 2,
      }),
  });

  return Array.from(
    new Set(voxels.map(({ pointIJK }) => Math.round(pointIJK[2])))
  ).sort((a, b) => a - b);
}

describe('The depth of a brush and of the statistics in a slab of a direct next planar viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [BrushTool],
      toolConfigurations: {
        [BrushTool.toolName]: {
          activeStrategy: 'FILL_INSIDE_CIRCLE',
          brushSize: 10,
        },
      },
      toolActivations: {
        [BrushTool.toolName]: {
          bindings: [{ mouseButton: csToolsEnums.MouseBindings.Primary }],
        },
      },
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('fills the slices of the slab with a brush and gives a new annotation the depth of the slab, as the legacy volume viewport did', async function () {
    testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.PLANAR,
      orientation: OrientationAxis.AXIAL,
      viewportId,
    });

    const viewport = renderingEngine.getViewport(viewportId);
    const volumeId = testUtils.encodeVolumeIdInfo({
      loader: 'fakeVolumeLoader',
      name: 'volumeURI',
      rows: 100,
      columns: 100,
      slices: 20,
      xSpacing: 1,
      ySpacing: 1,
      zSpacing: 1,
    });

    ToolGroupManager.getToolGroup(toolGroupId).addViewport(
      viewportId,
      renderingEngineId
    );
    await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });
    await testUtils.setVolumesOnNextViewport(viewport, [volumeId]);
    volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
      volumeId: segmentationId,
    });
    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Labelmap,
          data: { volumeId: segmentationId },
        },
      },
    ]);

    const labelmapRendered = new Promise((resolve) => {
      eventTarget.addEventListenerOnce(
        csToolsEnums.Events.SEGMENTATION_RENDERED,
        resolve
      );
    });

    segmentation.addLabelmapRepresentationToViewportMap({
      [viewportId]: [{ segmentationId }],
    });
    await labelmapRendered;

    const labelmap = cache.getVolume(segmentationId);
    const imageVolume = cache.getVolume(volumeId);

    expect(viewport.getResolvedView().toICamera().focalPoint[2]).toBe(9);

    await viewport.setImageIdIndex(9);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(viewport.getResolvedView().toICamera().focalPoint[2]).toBe(10);

    for (const slab of [0, 2, 4]) {
      const legacy = LEGACY_SLAB_DEPTH[slab];

      if (slab) {
        viewport.setDisplaySetAppearance(viewport.getSourceDisplaySetId(), {
          slabThickness: slab,
        });
      }

      clearLabelmap(labelmap);
      await clickAt(viewport.element, [200, 200]);

      expect(getFilledSlices(labelmap))
        .withContext(`brush, slab ${slab}`)
        .toEqual(legacy.brushSlices);
      expect(
        viewport.getViewReference().planeRestriction.referencePlaneThickness
      )
        .withContext(`reference plane thickness, slab ${slab}`)
        .toBe(legacy.referencePlaneThickness);
      expect(getStatisticSlices(viewport, imageVolume))
        .withContext(`statistics, slab ${slab}`)
        .toEqual(legacy.statisticSlices);
    }
  }, 30000);
});
