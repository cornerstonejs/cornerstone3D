import * as cornerstone3D from '@cornerstonejs/core';
import * as csTools3d from '../src/index';
import * as polySeg from '../../polymorphic-segmentation/src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { getConfig, setConfig } from '../src/config';
import {
  STRAIGHT_PLANE,
  createNextViewport,
  createSeries,
  renderAndWait,
  showStack,
  showVolume,
  waitFor,
  worldOfVoxel,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, Enums, geometryLoader } = cornerstone3D;
const { GeometryType } = Enums;
const {
  ToolGroupManager,
  PlanarFreehandContourSegmentationTool,
  segmentation,
  annotation,
  Enums: csToolsEnums,
} = csTools3d;
const { Surface } = csToolsEnums.SegmentationRepresentations;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'surfaceContourNext';
const segmentationId = 'surfaceContourNextSegmentation';
const contourToolName = PlanarFreehandContourSegmentationTool.toolName;

/** The slices of the default test series that the box crosses. */
const SLICES_OF_THE_BOX = [2, 3, 4, 5];

/**
 * The default test series (8 slices of 2 mm), moved along z by `depth`. The
 * polymorphic segmentation keeps the contours of every viewport in one cache
 * for the whole run, so each test puts its series at its own depth: the
 * contours of another test then lie on no slice of its viewport.
 */
function createSeriesAtDepth(depth) {
  const [x, y, z] = STRAIGHT_PLANE.origin;

  return createSeries({
    id: `surfaceContourNext${depth}`,
    plane: { ...STRAIGHT_PLANE, origin: [x, y, z + depth] },
  });
}

/**
 * A closed box surface of 12 triangles inside the series of
 * `createSeriesAtDepth` (8 slices of 2 mm from z = 20 + depth). It crosses
 * the slices 2 to 5, so its cut on each of them is one closed contour, and
 * it misses the others. The id of the surface is new for each depth, as the
 * polymorphic segmentation keeps the bounds of a surface by its id.
 */
function addBoxSurfaceSegmentation(depth) {
  const geometryId = `surfaceContourNextBox${depth}`;
  const [x0, x1, y0, y1] = [-4.5, 9.5, 10.5, 28.5];
  const [z0, z1] = [22.5 + depth, 31.5 + depth];
  const points = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ].flat();
  const triangles = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ];

  geometryLoader.createAndCacheGeometry(geometryId, {
    type: GeometryType.SURFACE,
    geometryData: {
      id: geometryId,
      color: [200, 0, 0],
      frameOfReferenceUID: 'bothModesFrame',
      points,
      polys: triangles.flatMap((triangle) => [3, ...triangle]),
      segmentIndex: 1,
    },
  });
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: Surface,
        data: { geometryIds: new Map([[1, geometryId]]) },
      },
    },
  ]);
}

/** Resolves after two animation frames, when the annotations are drawn. */
function nextFrames() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );
}

/**
 * Shows the surface of the segmentation as contours on a viewport, and
 * resolves when the polymorphic segmentation has made the contours and the
 * viewport has drawn them.
 */
async function showContours(viewport) {
  ToolGroupManager.getToolGroup(toolGroupId).addViewport(
    viewport.id,
    renderingEngineId
  );
  await segmentation.addContourRepresentationToViewportMap({
    [viewport.id]: [{ segmentationId }],
  });
  await waitFor(() => contourAnnotations(viewport).length > 0, 8000);
  await renderAndWait(viewport);
  await nextFrames();
}

/** Every contour annotation of the frame of reference of the viewport. */
function contourAnnotations(viewport) {
  return annotation.state.getAnnotations(contourToolName, viewport.element);
}

/** The contour annotations that the contour tool shows on the viewport. */
function shownContours(viewport) {
  const tool =
    ToolGroupManager.getToolGroup(toolGroupId).getToolInstance(contourToolName);

  return (
    tool.filterInteractableAnnotationsForElement(
      viewport.element,
      contourAnnotations(viewport)
    ) ?? []
  );
}

/** The SVG shapes that the viewport has drawn over its image. */
function drawnShapes(viewport) {
  return viewport.element.querySelectorAll('svg path, svg polyline').length;
}

/** The depth (world z) of the slice that a viewport shows. */
function depthOnDisplay(viewport) {
  return viewport.canvasToWorld([200, 150])[2];
}

/**
 * Checks that the viewport draws one contour, the one of the slice on
 * display, which lies on that slice.
 */
function expectTheContourOfTheSliceOnDisplay(viewport) {
  const shown = shownContours(viewport);

  expect(drawnShapes(viewport)).withContext('drawn shapes').toBe(1);
  expect(shown.length).withContext('contours shown').toBe(1);
  shown[0].data.contour.polyline.forEach((point) => {
    expect(point[2]).toBeCloseTo(depthOnDisplay(viewport), 1);
  });
}

/** Scrolls the viewport by one slice and resolves when it is drawn. */
async function scrollOneSlice(viewport, delta = 1) {
  await viewport.scroll(delta);
  await renderAndWait(viewport);
  await nextFrames();
}

describe('A surface shown as contours on a direct next planar viewport -- ', () => {
  let renderingEngine;
  let config;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    }).renderingEngine;
    config = getConfig();
    setConfig({ ...config, addons: { ...config.addons, polySeg } });
  });

  afterEach(function () {
    setConfig(config);
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
    cornerstone3D.displaySetRegistry.clear?.();
  });

  it('draws in stack mode the one contour of the image on display, and after a scroll the one of the next image', async function () {
    const series = await createSeriesAtDepth(1000);
    const viewport = createNextViewport(renderingEngine, 'contourStack');

    await showStack(viewport, series, 3);
    addBoxSurfaceSegmentation(1000);
    await showContours(viewport);

    expect(contourAnnotations(viewport).length).toBe(SLICES_OF_THE_BOX.length);
    expectTheContourOfTheSliceOnDisplay(viewport);

    await scrollOneSlice(viewport);
    expect(viewport.getCurrentImageIdIndex()).toBe(4);
    expectTheContourOfTheSliceOnDisplay(viewport);

    await scrollOneSlice(viewport, 3);
    expect(viewport.getCurrentImageIdIndex()).toBe(7);
    expect(drawnShapes(viewport)).toBe(0);
    expect(shownContours(viewport).length).toBe(0);
  });

  it('draws in volume mode the one contour of the slice on display, and after a scroll the one of the next slice', async function () {
    const series = await createSeriesAtDepth(2000);
    const viewport = createNextViewport(renderingEngine, 'contourVolume');

    await showVolume(viewport, series, 3);
    addBoxSurfaceSegmentation(2000);
    await showContours(viewport);

    expect(depthOnDisplay(viewport)).toBeCloseTo(
      worldOfVoxel(series, [0, 0, 3])[2],
      3
    );
    expect(contourAnnotations(viewport).length).toBe(SLICES_OF_THE_BOX.length);
    expectTheContourOfTheSliceOnDisplay(viewport);

    await scrollOneSlice(viewport);
    expect(depthOnDisplay(viewport)).not.toBeCloseTo(
      worldOfVoxel(series, [0, 0, 3])[2],
      1
    );
    expectTheContourOfTheSliceOnDisplay(viewport);
  });

  it('gives no contour on a 3D viewport, which has no slice to cut, as on the legacy 3D viewport', async function () {
    const series = await createSeriesAtDepth(3000);

    testUtils.createViewports(renderingEngine, {
      viewportType: Enums.ViewportType.VOLUME_3D,
      viewportId: 'contour3D',
      orientation: Enums.OrientationAxis.CORONAL,
      width: 400,
      height: 300,
      useEnableElement: true,
    });

    const viewport = renderingEngine.getViewport('contour3D');

    cornerstone3D.displaySetRegistry.add('contour3DVolume', {
      imageIds: series.imageIds,
      volumeId: series.volumeId,
    });
    await viewport.setDisplaySets({
      displaySetId: 'contour3DVolume',
    });
    addBoxSurfaceSegmentation(3000);

    const { annotationUIDsMap } = await polySeg.computeContourData(
      segmentationId,
      { viewport }
    );

    expect(viewport.getCurrentMode()).toBe('volume3d');
    expect(annotationUIDsMap.size).toBe(0);
    expect(contourAnnotations(viewport).length).toBe(0);
  });
});
