import * as cornerstone3D from '@cornerstonejs/core';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { getConfig, setConfig } from '../src/config';
import { getSurfaceActorEntry } from '../src/stateManagement/segmentation/helpers';
import { createNextPlanarViewport } from './nextLabelmapScenes';
import {
  createNextViewport,
  createSeries,
  showVolume,
  waitFor,
} from '../../core/test/utils/planarSeriesBothModes';

const { utilities, Enums, volumeLoader, geometryLoader, cache } = cornerstone3D;
const { ViewportType, OrientationAxis, GeometryType } = Enums;
const {
  SegmentationIntersectionTool,
  ToolGroupManager,
  annotation,
  segmentation,
  Enums: csToolsEnums,
} = csTools3d;
const { Events: csToolsEvents } = csToolsEnums;
const { Surface } = csToolsEnums.SegmentationRepresentations;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'segmentationIntersectionNext';
const viewportId = 'segmentationIntersectionNext';
const viewport3DId = 'segmentationIntersectionNext3DSurface';
const toolName = SegmentationIntersectionTool.toolName;
const segmentationId = 'segmentationIntersectionNextSphere';
const geometryId = 'segmentationIntersectionNextSphere';

/** A series of 40 by 40 by 20 voxels of 1 mm, from z = 20 to z = 39. */
const SIZE = {
  rows: 40,
  columns: 40,
  slices: 20,
  columnSpacing: 1,
  rowSpacing: 1,
  sliceSpacing: 1,
};

/** The centre and the radius of the sphere of the segmentation, in mm. */
const CENTER = [10, 25, 30];
const RADIUS = 8;

/** The shift along x, in mm, of the points of the sphere in an edit. */
const MOVE_X = 10;

/** The size of a voxel of the series, in mm. */
const VOXEL = 1;

/**
 * The scrolls of the planar viewport from the slice at z = 30, through the
 * centre of the sphere: five slices toward one end, ten slices back, then
 * fourteen slices to a slice at z = 21 or z = 39, which the sphere does not
 * reach. The cut has a radius of 8 mm at z = 30 and of 6.24 mm five slices
 * away.
 */
const SCROLLS = [5, -10, 14];

/** Makes a volume of 64 by 64 voxels of 1 mm and 10 slices in the cache. */
async function createVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    rows: 64,
    columns: 64,
    slices: 10,
    xSpacing: 1,
    ySpacing: 1,
    zSpacing: 1,
  });

  await volumeLoader.createAndCacheVolume(volumeId, { imageIds: [] });

  return volumeId;
}

/** Resolves when the annotations of the element are drawn once more. */
function waitForAnnotationsRendered(element) {
  return new Promise((resolve) => {
    element.addEventListener(csToolsEvents.ANNOTATION_RENDERED, resolve, {
      once: true,
    });
  });
}

/**
 * Sets the tool enabled on the tool group and resolves when the annotations
 * of the element are drawn once more.
 */
function enableToolAndWaitForRender(element) {
  const rendered = waitForAnnotationsRendered(element);

  ToolGroupManager.getToolGroup(toolGroupId).setToolEnabled(toolName);

  return rendered;
}

/** The annotations of the tool in the frame of reference of a viewport. */
function getIntersectionAnnotations(viewport) {
  return (
    annotation.state.getAnnotations(
      toolName,
      viewport.getFrameOfReferenceUID()
    ) || []
  );
}

/**
 * Adds a segmentation whose Surface representation is a closed sphere of
 * radius `RADIUS` around `CENTER`, in the frame of the test series.
 */
function addSphereSegmentation() {
  const sphere = vtkSphereSource.newInstance({
    center: CENTER,
    radius: RADIUS,
    phiResolution: 24,
    thetaResolution: 24,
  });

  sphere.update();

  const polyData = sphere.getOutputData();

  geometryLoader.createAndCacheGeometry(geometryId, {
    type: GeometryType.SURFACE,
    geometryData: {
      id: geometryId,
      color: [255, 0, 0],
      frameOfReferenceUID: 'bothModesFrame',
      points: Array.from(polyData.getPoints().getData()),
      polys: Array.from(polyData.getPolys().getData()),
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

/**
 * Makes a next 3D viewport outside the tool group of the tool, shows the
 * sphere on it as a Surface representation and resolves when its actor is
 * mounted.
 */
async function showSphereOn3DViewport(renderingEngine) {
  testUtils.createViewports(renderingEngine, {
    viewportType: ViewportType.VOLUME_3D,
    viewportId: viewport3DId,
    orientation: OrientationAxis.CORONAL,
    width: 300,
    height: 300,
    useEnableElement: true,
  });
  addSphereSegmentation();
  segmentation.addSegmentationRepresentations(viewport3DId, [
    { segmentationId, type: Surface },
  ]);
  await waitFor(() => getSurfaceActorEntry(viewport3DId, segmentationId, 1));

  return renderingEngine.getViewport(viewport3DId);
}

/**
 * A polySeg add-on that converts nothing. The default listener of a Surface
 * representation asks the add-on for an update of the surface data.
 */
function createPolySegStandIn() {
  return {
    init: () => undefined,
    canComputeRequestedRepresentation: () => false,
    updateSurfaceData: () => Promise.resolve(),
  };
}

/**
 * The paths that the tools drew on the SVG layer of a viewport, each with its
 * points in canvas coordinates and whether it is closed.
 */
function drawnPaths(viewport) {
  return [...viewport.element.querySelectorAll('svg path')].map((path) => {
    const d = path.getAttribute('d');
    const numbers = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    const points = [];

    for (let i = 0; i + 1 < numbers.length; i += 2) {
      points.push([numbers[i], numbers[i + 1]]);
    }

    return {
      points,
      closed: d.trim().endsWith('Z'),
      stroke: path.getAttribute('stroke'),
    };
  });
}

/**
 * The height of the centre of the sphere above the slice on display, toward
 * the viewer: the view plane normal points from the slice to the viewer.
 */
function heightOfCenter(viewport) {
  const { cameraFocalPoint, viewPlaneNormal } = viewport.getViewReference();

  return [0, 1, 2].reduce(
    (sum, axis) =>
      sum + (CENTER[axis] - cameraFocalPoint[axis]) * viewPlaneNormal[axis],
    0
  );
}

/**
 * The distance in mm between the world point of a canvas point and the axis
 * of the sphere along the view plane normal: the radius of the point on the
 * circle where the sphere cuts the slice. The sphere is at `CENTER` when no
 * other centre is given.
 */
function radiusOnSlice(viewport, canvasPoint, height, center = CENTER) {
  const world = viewport.canvasToWorld(canvasPoint);
  const squared = [0, 1, 2].reduce(
    (sum, axis) => sum + (world[axis] - center[axis]) ** 2,
    0
  );

  return Math.sqrt(Math.max(squared - height * height, 0));
}

/** Asks for a draw of the annotations of a viewport and waits for it. */
function renderAnnotationsAndWait(viewport) {
  const rendered = waitForAnnotationsRendered(viewport.element);

  csTools3d.utilities.triggerAnnotationRenderForViewportIds([viewport.id]);

  return rendered;
}

/** Scrolls the viewport and resolves when its annotations are drawn again. */
async function scrollAndWaitForRender(viewport, delta) {
  const sliceIndex = viewport.getSliceIndex();
  const rendered = waitForAnnotationsRendered(viewport.element);

  utilities.scroll(viewport, { delta });
  await rendered;
  expect(viewport.getSliceIndex()).toBe(sliceIndex + delta);
}

describe('SegmentationIntersectionTool on a direct next viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [SegmentationIntersectionTool],
      viewportIds: [viewportId],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  it('is set enabled on a planar viewport in volume mode and adds its annotation, with no outline when no viewport shows a surface', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);

    await testUtils.setVolumesOnNextViewport(viewport, [await createVolume()]);
    expect(viewport.getCurrentMode()).toBe('volume');
    await enableToolAndWaitForRender(viewport.element);

    const annotations = getIntersectionAnnotations(viewport);

    expect(annotations.length).toBe(1);
    expect(annotations[0].data.actorsWorldPointsMap.size).toBe(0);
  });

  it('is set enabled on a planar viewport in stack mode and adds its annotation', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);
    const imageIds = [0, 1, 2].map((sliceIndex) =>
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
    expect(viewport.getCurrentMode()).toBe('stack');
    await enableToolAndWaitForRender(viewport.element);

    expect(getIntersectionAnnotations(viewport).length).toBe(1);
  });

  it('is set enabled while its viewport shows nothing, without a throw', function () {
    createNextPlanarViewport(renderingEngine, viewportId);

    expect(() => {
      ToolGroupManager.getToolGroup(toolGroupId).setToolEnabled(toolName);
    }).not.toThrow();
  });

  it('is set enabled on a 3D viewport, which has no slice', async function () {
    testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.VOLUME_3D,
      viewportId,
      useEnableElement: true,
    });

    const viewport = renderingEngine.getViewport(viewportId);
    const volumeId = await createVolume();

    utilities.genericViewportDisplaySetMetadataProvider.add(
      'segmentationIntersectionNext3D',
      { imageIds: cache.getVolume(volumeId).imageIds, volumeId }
    );
    await viewport.setDisplaySets({
      displaySetId: 'segmentationIntersectionNext3D',
      options: { renderMode: 'vtkVolume3d' },
    });
    await enableToolAndWaitForRender(viewport.element);

    expect(getIntersectionAnnotations(viewport).length).toBe(1);
  });
});

describe('SegmentationIntersectionTool with the surface of a segmentation on a 3D viewport -- ', () => {
  let renderingEngine;
  let config;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [SegmentationIntersectionTool],
      viewportIds: [viewportId],
    }).renderingEngine;
    config = getConfig();
    setConfig({ ...config, addons: { polySeg: createPolySegStandIn() } });
  });

  afterEach(function () {
    setConfig(config);
    if (cache.getGeometry(geometryId)) {
      cache.removeGeometryLoadObject(geometryId);
    }
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
    utilities.genericViewportDisplaySetMetadataProvider.clear?.();
  });

  it('draws on an axial planar viewport the closed line where the sphere cuts the slice, nothing on a slice outside the sphere, and the line follows a scroll', async function () {
    const series = await createSeries({
      id: 'segmentationIntersectionNext',
      size: SIZE,
    });
    const viewport = createNextViewport(renderingEngine, viewportId);

    await showVolume(viewport, series, 10, {
      orientation: OrientationAxis.AXIAL,
    });
    await showSphereOn3DViewport(renderingEngine);
    await enableToolAndWaitForRender(viewport.element);

    const segmentColor = segmentation.config.color.getSegmentIndexColor(
      viewport3DId,
      segmentationId,
      1
    );
    const stroke = `rgb(${segmentColor.slice(0, 3).join(', ')})`;
    let cuts = 0;
    let misses = 0;

    for (const delta of [0, ...SCROLLS]) {
      if (delta) {
        await scrollAndWaitForRender(viewport, delta);
      }

      const height = heightOfCenter(viewport);
      const paths = drawnPaths(viewport);

      expect(getIntersectionAnnotations(viewport).length).toBe(1);

      if (Math.abs(height) > RADIUS + VOXEL / 2) {
        misses += 1;
        expect(paths.length).toBe(0);
        continue;
      }

      const cutRadius = Math.sqrt(RADIUS * RADIUS - height * height);

      cuts += 1;
      expect(paths.length).toBe(1);
      expect(paths[0]?.closed).toBe(true);
      expect(paths[0]?.stroke).toBe(stroke);
      expect(paths[0]?.points.length).toBeGreaterThan(8);
      (paths[0]?.points || []).forEach((point) => {
        expect(
          Math.abs(radiusOnSlice(viewport, point, height) - cutRadius)
        ).toBeLessThan(VOXEL);
      });
    }

    const [{ data }] = getIntersectionAnnotations(viewport);

    expect(cuts).toBe(3);
    expect(misses).toBe(1);
    expect(
      data.actorsWorldPointsMap.get(`${segmentationId}-Surface-1`)?.size
    ).toBe(4);
  });

  it('draws the cut of new surface data on a slice that it cut before, and nothing for a segment hidden on the 3D viewport', async function () {
    const series = await createSeries({
      id: 'segmentationIntersectionNextData',
      size: SIZE,
    });
    const viewport = createNextViewport(renderingEngine, viewportId);

    await showVolume(viewport, series, 10, {
      orientation: OrientationAxis.AXIAL,
    });
    await showSphereOn3DViewport(renderingEngine);
    await enableToolAndWaitForRender(viewport.element);

    const surface = cache.getGeometry(geometryId).data;
    const movedCenter = [CENTER[0] + MOVE_X, CENTER[1], CENTER[2]];
    const height = heightOfCenter(viewport);
    const cutRadius = Math.sqrt(RADIUS * RADIUS - height * height);

    expect(drawnPaths(viewport).length).toBe(1);

    surface.points = surface.points.map((value, index) =>
      index % 3 === 0 ? value + MOVE_X : value
    );
    await renderAnnotationsAndWait(viewport);

    const moved = drawnPaths(viewport);

    expect(moved.length).toBe(1);
    expect(moved[0]?.closed).toBe(true);
    (moved[0]?.points || []).forEach((point) => {
      expect(
        Math.abs(
          radiusOnSlice(viewport, point, height, movedCenter) - cutRadius
        )
      ).toBeLessThan(VOXEL);
    });

    segmentation.config.visibility.setSegmentIndexVisibility(
      viewport3DId,
      { segmentationId, type: Surface },
      1,
      false
    );
    await renderAnnotationsAndWait(viewport);

    expect(drawnPaths(viewport).length).toBe(0);
  });
});
