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

const { utilities, Enums, geometryLoader, getWebWorkerManager } = cornerstone3D;
const { GeometryType, OrientationAxis } = Enums;
const {
  ToolGroupManager,
  PlanarFreehandContourSegmentationTool,
  segmentation,
  annotation,
  Enums: csToolsEnums,
} = csTools3d;
const { Contour } = csToolsEnums.SegmentationRepresentations;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'contourCutsMprNext';
const contourToolName = PlanarFreehandContourSegmentationTool.toolName;

/**
 * A series of 48 by 48 voxels of 1 mm and 24 axial slices 2 mm apart, from
 * x = -10, y = 5, z = 20: the slices of an RTSTRUCT lie on its images.
 */
const SIZE = {
  rows: 48,
  columns: 48,
  slices: 24,
  columnSpacing: 1,
  rowSpacing: 1,
  sliceSpacing: 2,
};

/** The world point of the middle voxel of the series, [14, 29, 44]. */
const CENTER = [14, 29, 44];

/** The radius of the synthetic sphere, in mm. */
const RADIUS = 9;

/** The z of each axial slice of the series. */
const SLICE_DEPTHS = Array.from(
  { length: SIZE.slices },
  (_, k) => STRAIGHT_PLANE.origin[2] + k * SIZE.sliceSpacing
);

/** The points of a circle of an axial plane, counter clockwise from +x. */
function circle([cx, cy], radius, z, count = 64) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;

    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z];
  });
}

/**
 * The circles of a sphere on the axial slices of the series that cross it
 * (|z - centre| < radius), one closed planar contour each.
 */
function sphereContours(center, radius) {
  return SLICE_DEPTHS.filter((z) => Math.abs(z - center[2]) < radius).map(
    (z) => [circle(center, Math.sqrt(radius ** 2 - (z - center[2]) ** 2), z)]
  );
}

/**
 * Adds a contour segmentation the way an application adds the contours of
 * an RTSTRUCT (OHIF `createSegmentationForRTDisplaySet`): one contour set
 * geometry per structure, its contours as `{ numberOfPoints, points, type:
 * 'CLOSED_PLANAR' }`, and a segmentation whose Contour representation holds
 * only the geometry ids. `structures` maps a segment index to the contours
 * of each slice (a list of point lists per slice).
 */
function addRtStructLikeSegmentation(segmentationId, structures) {
  const geometryIds = Object.entries(structures).map(
    ([segmentIndex, slices]) => {
      const geometryId = `${segmentationId}:structure-${segmentIndex}`;
      const data = slices.flat().map((points) => ({
        numberOfPoints: points.length,
        points,
        type: 'CLOSED_PLANAR',
        isSupported: false,
      }));

      geometryLoader.createAndCacheGeometry(geometryId, {
        type: GeometryType.CONTOUR,
        geometryData: {
          data,
          id: `structure-${segmentIndex}`,
          color: [200, 60, 60],
          frameOfReferenceUID: 'bothModesFrame',
          segmentIndex: Number(segmentIndex),
        },
      });

      return geometryId;
    }
  );

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: { type: Contour, data: { geometryIds } },
      config: {
        segments: Object.fromEntries(
          Object.keys(structures).map((segmentIndex) => [
            segmentIndex,
            { segmentIndex: Number(segmentIndex), label: segmentIndex },
          ])
        ),
      },
    },
  ]);
}

/**
 * Counts the tasks of the PolySeg worker by name from now on, and gives the
 * counts.
 */
function countWorkerTasks() {
  const counts = {};
  const workerManager = getWebWorkerManager();
  const executeTask = workerManager.executeTask.bind(workerManager);

  spyOn(workerManager, 'executeTask').and.callFake((worker, task, ...rest) => {
    counts[task] = (counts[task] ?? 0) + 1;
    return executeTask(worker, task, ...rest);
  });

  return counts;
}

/**
 * A closed box surface of 12 triangles from `min` to `max`, cached as a
 * geometry, as a Surface representation holds it.
 */
function createBoxSurface(geometryId, [x0, y0, z0], [x1, y1, z1]) {
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
}

/** Every contour annotation of the frame of reference of the viewport. */
function contourAnnotations(viewport) {
  return annotation.state.getAnnotations(contourToolName, viewport.element);
}

/** The contour annotations that the contour tool shows on the viewport. */
function shownContours(viewport) {
  const tool =
    ToolGroupManager.getToolGroup(toolGroupId).getToolInstance(contourToolName);

  if (!tool) {
    return [];
  }

  return (
    tool.filterInteractableAnnotationsForElement(
      viewport.element,
      contourAnnotations(viewport)
    ) ?? []
  );
}

/** Resolves after two animation frames, when the annotations are drawn. */
function nextFrames() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );
}

/**
 * Makes the axial, sagittal and coronal next planar viewports of an MPR over
 * the volume of the series, each at the slice through `point`.
 */
async function createMpr(renderingEngine, series, point = CENTER) {
  const panes = {};

  for (const orientation of ['axial', 'sagittal', 'coronal']) {
    const viewport = createNextViewport(
      renderingEngine,
      `contourCuts-${orientation}`
    );

    ToolGroupManager.getToolGroup(toolGroupId).addViewport(
      viewport.id,
      renderingEngineId
    );
    await showVolume(viewport, series, 0, {
      orientation: OrientationAxis[orientation.toUpperCase()],
    });
    await moveToPoint(viewport, point);
    panes[orientation] = viewport;
  }

  return panes;
}

/** Moves the slice of a viewport in volume mode to the one through a point. */
async function moveToPoint(viewport, point) {
  viewport.setViewState({
    slice: { kind: 'volumePoint', sliceWorldPoint: point },
  });
  await renderAndWait(viewport);
}

/**
 * Shows the contour representation of the segmentation on the viewports in
 * the order given, as OHIF does after a hydration from the sagittal pane:
 * the pane that the RTSTRUCT was loaded in first.
 */
async function showContours(segmentationId, viewports) {
  for (const viewport of viewports) {
    await segmentation.addContourRepresentationToViewport(viewport.id, [
      { segmentationId },
    ]);
  }
}

/** Waits until a viewport shows at least one contour, then for the draw. */
async function waitForShownContours(viewport, timeout = 15000) {
  await waitFor(() => shownContours(viewport).length > 0, timeout);
  await renderAndWait(viewport);
  await nextFrames();
}

/** Waits until the cut of the plane on display is drawn (or none to draw). */
async function settle(viewport) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await renderAndWait(viewport);
  await nextFrames();
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** The distance of a point from a centre, within the plane of a normal. */
function inPlaneDistance(point, center, normal) {
  const offset = sub(point, center);
  const along = dot(offset, normal);

  return Math.sqrt(Math.max(0, dot(offset, offset) - along ** 2));
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * The span of a contour along a direction: a cut through the middle of the
 * sphere goes around it, so it spans nearly its diameter both ways.
 */
function spanAlong(contour, direction) {
  const values = contour.data.contour.polyline.map((point) =>
    dot(point, direction)
  );

  return Math.max(...values) - Math.min(...values);
}

/**
 * Checks that a viewport shows one closed path, the cut of the sphere by the
 * plane of the slice on display. The points lie on one plane, within half a
 * slice of the focal point (an oblique slice need not pass through it), and
 * on the circle of the cut of the sphere by that plane: within one slice
 * spacing of its radius, as the surface made from contours 2 mm apart closes
 * between and beyond them. The path goes around, spanning nearly the
 * diameter of the circle along both directions of the plane.
 */
function expectCutOfTheSphere(viewport, center, radius) {
  const {
    viewPlaneNormal: normal,
    viewUp,
    cameraFocalPoint,
  } = viewport.getViewReference();
  const shown = shownContours(viewport);

  expect(shown.length).withContext('closed paths of the cut').toBe(1);
  expect(shown[0].data.contour.closed).toBe(true);

  const { polyline } = shown[0].data.contour;
  const planeOffset = dot(sub(polyline[0], cameraFocalPoint), normal);
  const offset = dot(sub(center, cameraFocalPoint), normal) - planeOffset;
  const centerOnPlane = sub(
    center,
    normal.map((value) => value * offset)
  );
  const radiusOnPlane = Math.sqrt(radius ** 2 - offset ** 2);

  expect(Math.abs(planeOffset))
    .withContext('distance of the cut from the focal point')
    .toBeLessThan(SIZE.sliceSpacing / 2);
  polyline.forEach((point) => {
    expect(Math.abs(dot(sub(point, cameraFocalPoint), normal) - planeOffset))
      .withContext('distance from the plane of the cut')
      .toBeLessThan(0.01);
    expect(
      Math.abs(inPlaneDistance(point, centerOnPlane, normal) - radiusOnPlane)
    )
      .withContext('distance from the circle of the cut')
      .toBeLessThanOrEqual(SIZE.sliceSpacing);
  });
  [viewUp, cross(viewUp, normal)].forEach((direction) => {
    expect(spanAlong(shown[0], direction))
      .withContext(`span along ${direction}`)
      .toBeGreaterThan(2 * radiusOnPlane - 2 * SIZE.sliceSpacing);
  });
}

describe('The contours of an RTSTRUCT on the panes of an MPR -- ', () => {
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

  it('draws in the sagittal and coronal panes the cut of a sphere through its centre, and none outside it', async function () {
    const series = await createSeries({ id: 'contourCutsSphere', size: SIZE });
    const panes = await createMpr(renderingEngine, series);

    addRtStructLikeSegmentation('cutsSphere', {
      1: sphereContours(CENTER, RADIUS),
    });
    await showContours('cutsSphere', [
      panes.sagittal,
      panes.axial,
      panes.coronal,
    ]);
    await waitForShownContours(panes.sagittal);
    await waitForShownContours(panes.coronal);

    expectCutOfTheSphere(panes.sagittal, CENTER, RADIUS);
    expectCutOfTheSphere(panes.coronal, CENTER, RADIUS);

    await moveToPoint(panes.sagittal, worldOfVoxel(series, [5, 24, 12]));
    await settle(panes.sagittal);
    expect(shownContours(panes.sagittal).length)
      .withContext('a sagittal slice outside the sphere')
      .toBe(0);
  }, 60000);

  it('keeps the axial pane on its own contours, with no cut drawn over them', async function () {
    const series = await createSeries({ id: 'contourCutsAxial', size: SIZE });
    const panes = await createMpr(renderingEngine, series);
    const contours = sphereContours(CENTER, RADIUS);
    const middle = contours.findIndex(([points]) => points[0][2] === CENTER[2]);

    addRtStructLikeSegmentation('cutsAxial', { 1: contours });
    await showContours('cutsAxial', [
      panes.sagittal,
      panes.axial,
      panes.coronal,
    ]);
    await waitForShownContours(panes.sagittal);
    await waitForShownContours(panes.coronal);
    await renderAndWait(panes.axial);
    await nextFrames();

    const shown = shownContours(panes.axial);

    expect(shown.length).withContext('contours of the axial slice').toBe(1);
    expect(shown[0].data.contour.polyline).toEqual(contours[middle][0]);
    expect(
      contourAnnotations(panes.axial).filter(
        (contour) =>
          Math.abs(dot(contour.metadata.viewPlaneNormal, [0, 0, 1])) > 0.99
      ).length
    )
      .withContext('axial contours: the originals only')
      .toBe(contours.length);
  }, 60000);

  it('follows a scroll of the sagittal pane with the cut of each slice, and keeps the annotation state bounded over 50 scrolls', async function () {
    const series = await createSeries({ id: 'contourCutsScroll', size: SIZE });
    const panes = await createMpr(renderingEngine, series);

    addRtStructLikeSegmentation('cutsScroll', {
      1: sphereContours(CENTER, RADIUS),
    });
    await showContours('cutsScroll', [
      panes.sagittal,
      panes.axial,
      panes.coronal,
    ]);
    await waitForShownContours(panes.sagittal);
    await waitForShownContours(panes.coronal);

    const countBefore = contourAnnotations(panes.sagittal).length;
    const sagittal = panes.sagittal;
    const tasks = countWorkerTasks();
    let shownSlices = 0;

    for (let step = 0; step < 50; step++) {
      const delta = step % 20 < 10 ? 1 : -1;

      await sagittal.scroll(delta);
      await settle(sagittal);

      const x = sagittal.getViewReference().cameraFocalPoint[0];
      const shown = shownContours(sagittal);
      const insideSphere = Math.abs(x - CENTER[0]) < RADIUS - 1;

      shown.forEach((contour) =>
        contour.data.contour.polyline.forEach((point) =>
          expect(Math.abs(point[0] - x))
            .withContext(`cut at x = ${x}`)
            .toBeLessThan(0.6)
        )
      );
      if (insideSphere) {
        expect(shown.length).withContext(`cut at x = ${x}`).toBe(1);
        shownSlices++;
      }
    }

    expect(shownSlices).toBeGreaterThan(0);
    expect(contourAnnotations(sagittal).length)
      .withContext('annotations after 50 scrolls')
      .toBeLessThanOrEqual(countBefore);
    expect(tasks).withContext('worker tasks of 50 scrolls').toEqual({});
  }, 120000);

  it('converts the contours of a segment once for every pane, and again when they change', async function () {
    const series = await createSeries({ id: 'contourCutsOnce', size: SIZE });
    const panes = await createMpr(renderingEngine, series);
    const tasks = countWorkerTasks();

    addRtStructLikeSegmentation('cutsOnce', {
      1: sphereContours(CENTER, RADIUS),
    });
    await showContours('cutsOnce', [
      panes.sagittal,
      panes.axial,
      panes.coronal,
    ]);
    await waitForShownContours(panes.sagittal);
    await waitForShownContours(panes.coronal);

    expect(tasks.convertContourToSurface).withContext('conversions').toBe(1);
    expect(tasks.cutSurfacesIntoPlanes).withContext('cuts').toBe(2);

    segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      'cutsOnce'
    );
    await waitFor(() => tasks.convertContourToSurface === 2, 15000);
    await waitForShownContours(panes.sagittal);
    await waitForShownContours(panes.coronal);
    await settle(panes.sagittal);

    expect(tasks.convertContourToSurface)
      .withContext('conversions after a change of the contours')
      .toBe(2);
    expectCutOfTheSphere(panes.sagittal, CENTER, RADIUS);
    expectCutOfTheSphere(panes.coronal, CENTER, RADIUS);
  }, 60000);

  it('cuts the surface of the Surface representation of the segmentation, with no conversion', async function () {
    const series = await createSeries({ id: 'contourCutsSurface', size: SIZE });
    const panes = await createMpr(renderingEngine, series);
    const tasks = countWorkerTasks();
    const [min, max] = [
      [CENTER[0] - 4, CENTER[1] - 6, CENTER[2] - 5],
      [CENTER[0] + 4, CENTER[1] + 6, CENTER[2] + 5],
    ];

    addRtStructLikeSegmentation('cutsSurface', {
      1: sphereContours(CENTER, RADIUS),
    });
    createBoxSurface('cutsSurfaceBox', min, max);
    segmentation.state.getSegmentation(
      'cutsSurface'
    ).representationData.Surface = {
      geometryIds: new Map([[1, 'cutsSurfaceBox']]),
    };
    await showContours('cutsSurface', [panes.sagittal, panes.axial]);
    await waitForShownContours(panes.sagittal);

    const [cut] = shownContours(panes.sagittal);

    expect(tasks.convertContourToSurface).toBeUndefined();
    cut.data.contour.polyline.forEach((point) => {
      expect(point[1]).toBeGreaterThan(min[1] - 0.01);
      expect(point[1]).toBeLessThan(max[1] + 0.01);
      expect(point[2]).toBeGreaterThan(min[2] - 0.01);
      expect(point[2]).toBeLessThan(max[2] + 0.01);
    });
    expect(spanAlong(cut, [0, 1, 0])).toBeCloseTo(max[1] - min[1], 1);
    expect(spanAlong(cut, [0, 0, 1])).toBeCloseTo(max[2] - min[2], 1);
  }, 60000);

  it('cuts again for a pane made again under the same id, and leaves no cut of the one before', async function () {
    const series = await createSeries({ id: 'contourCutsRemount', size: SIZE });
    const panes = await createMpr(renderingEngine, series);

    addRtStructLikeSegmentation('cutsRemount', {
      1: sphereContours(CENTER, RADIUS),
    });
    await showContours('cutsRemount', [panes.sagittal, panes.axial]);
    await waitForShownContours(panes.sagittal);

    const before = contourAnnotations(panes.axial).length;

    renderingEngine.disableElement(panes.sagittal.id);
    expect(contourAnnotations(panes.axial).length)
      .withContext('annotations when the sagittal pane is gone')
      .toBeLessThan(before);

    const sagittal = createNextViewport(renderingEngine, panes.sagittal.id);

    ToolGroupManager.getToolGroup(toolGroupId).addViewport(
      sagittal.id,
      renderingEngineId
    );
    await showVolume(sagittal, series, 0, {
      orientation: OrientationAxis.SAGITTAL,
    });
    await moveToPoint(sagittal, CENTER);
    await showContours('cutsRemount', [sagittal]);
    await waitForShownContours(sagittal);

    expectCutOfTheSphere(sagittal, CENTER, RADIUS);
    expect(contourAnnotations(sagittal).length).toBe(before);
  }, 60000);

  it('gives no cut on a 3D viewport, which has no slice', async function () {
    const series = await createSeries({ id: 'contourCuts3D', size: SIZE });
    const tasks = countWorkerTasks();

    testUtils.createViewports(renderingEngine, {
      viewportType: Enums.ViewportType.VOLUME_3D,
      viewportId: 'contourCuts3D',
      orientation: OrientationAxis.CORONAL,
      width: 400,
      height: 300,
      useEnableElement: true,
    });

    const viewport = renderingEngine.getViewport('contourCuts3D');

    ToolGroupManager.getToolGroup(toolGroupId).addViewport(
      viewport.id,
      renderingEngineId
    );
    cornerstone3D.displaySetRegistry.add('contourCuts3DVolume', {
      imageIds: series.imageIds,
      volumeId: series.volumeId,
    });
    await viewport.setDisplaySets({ displaySetId: 'contourCuts3DVolume' });
    addRtStructLikeSegmentation('cuts3D', {
      1: sphereContours(CENTER, RADIUS),
    });
    await showContours('cuts3D', [viewport]);
    await settle(viewport);
    await settle(viewport);

    expect(tasks).toEqual({});
  }, 60000);

  it('draws the cut on an oblique plane the same way', async function () {
    const series = await createSeries({ id: 'contourCutsOblique', size: SIZE });
    const panes = await createMpr(renderingEngine, series);
    const normal = [Math.SQRT1_2, Math.SQRT1_2, 0];

    addRtStructLikeSegmentation('cutsOblique', {
      1: sphereContours(CENTER, RADIUS),
    });
    await showContours('cutsOblique', [
      panes.sagittal,
      panes.axial,
      panes.coronal,
    ]);
    await waitForShownContours(panes.sagittal);

    panes.sagittal.setOrientation({
      viewPlaneNormal: normal,
      viewUp: [0, 0, 1],
    });
    await moveToPoint(panes.sagittal, CENTER);
    await waitFor(
      () =>
        shownContours(panes.sagittal).some(
          (contour) =>
            Math.abs(dot(contour.metadata.viewPlaneNormal, normal)) > 0.99
        ),
      15000
    );
    await settle(panes.sagittal);

    expectCutOfTheSphere(panes.sagittal, CENTER, RADIUS);
    expect(
      contourAnnotations(panes.sagittal).filter(
        (contour) =>
          Math.abs(dot(contour.metadata.viewPlaneNormal, [1, 0, 0])) > 0.99
      ).length
    )
      .withContext('cuts of the sagittal plane left behind')
      .toBe(0);
  }, 60000);

  it('cuts two regions of a slice into two closed paths, and a ring into its walls', async function () {
    const series = await createSeries({ id: 'contourCutsShapes', size: SIZE });
    const panes = await createMpr(renderingEngine, series);
    const [front, back] = [
      [CENTER[0], CENTER[1] - 11, CENTER[2]],
      [CENTER[0], CENTER[1] + 11, CENTER[2]],
    ];
    const twoRegions = sphereContours(front, 7).map((slice, index) => [
      ...slice,
      ...sphereContours(back, 7)[index],
    ]);
    const ring = SLICE_DEPTHS.filter((z) => Math.abs(z - CENTER[2]) < 8).map(
      (z) => [circle(CENTER, 10, z), circle(CENTER, 5, z).reverse()]
    );

    addRtStructLikeSegmentation('cutsShapes', { 1: twoRegions, 2: ring });
    await showContours('cutsShapes', [
      panes.sagittal,
      panes.axial,
      panes.coronal,
    ]);
    await waitForShownContours(panes.sagittal);
    await waitForShownContours(panes.coronal);

    const bySegment = (viewport, segmentIndex) =>
      shownContours(viewport).filter(
        (contour) => contour.data.segmentation.segmentIndex === segmentIndex
      );

    expect(bySegment(panes.sagittal, 1).length)
      .withContext('two regions on the sagittal plane through both')
      .toBe(2);
    expect(bySegment(panes.sagittal, 2).length)
      .withContext('the two walls of the ring on the sagittal plane')
      .toBe(2);
    bySegment(panes.sagittal, 2).forEach((contour) =>
      contour.data.contour.polyline.forEach((point) => {
        const fromAxis = Math.abs(point[1] - CENTER[1]);
        const [firstZ, lastZ] = [ring[0][0][0][2], ring.at(-1)[0][0][2]];

        expect(point[2]).toBeGreaterThan(firstZ - SIZE.sliceSpacing);
        expect(point[2]).toBeLessThan(lastZ + SIZE.sliceSpacing);
        expect(fromAxis).toBeLessThan(10 + 1);
        if (point[2] >= firstZ && point[2] <= lastZ) {
          expect(fromAxis)
            .withContext('a wall of the ring')
            .toBeGreaterThan(5 - 1);
        }
      })
    );

    await moveToPoint(panes.coronal, front);
    await settle(panes.coronal);
    expect(bySegment(panes.coronal, 1).length)
      .withContext('one region on the coronal plane through the front one')
      .toBe(1);
  }, 60000);

  it('reports a conversion that fails once, by the segmentation and the reason, and draws no cut', async function () {
    const series = await createSeries({ id: 'contourCutsFail', size: SIZE });
    const panes = await createMpr(renderingEngine, series);
    const warnings = [];
    const log = utilities.logger.toolsLog.getLogger(
      'tools',
      'displayTools',
      'Contour',
      'contourCuts'
    );

    spyOn(log, 'warn').and.callFake((...args) =>
      warnings.push(args.map(String).join(' '))
    );
    const workerManager = getWebWorkerManager();
    const executeTask = workerManager.executeTask.bind(workerManager);

    spyOn(workerManager, 'executeTask').and.callFake((worker, task, ...rest) =>
      task === 'convertContourToSurface'
        ? Promise.reject(new Error('no surface for these contours'))
        : executeTask(worker, task, ...rest)
    );

    addRtStructLikeSegmentation('cutsFail', {
      1: sphereContours(CENTER, RADIUS),
    });
    await showContours('cutsFail', [
      panes.sagittal,
      panes.axial,
      panes.coronal,
    ]);
    await waitForShownContours(panes.axial);
    await settle(panes.sagittal);
    await panes.sagittal.scroll(1);
    await settle(panes.sagittal);
    await panes.coronal.scroll(1);
    await settle(panes.coronal);

    const reports = warnings.filter(
      (text) =>
        text.includes('cutsFail') &&
        text.includes('no surface for these contours')
    );

    expect(reports.length).withContext(warnings.join('\n')).toBe(1);
    expect(shownContours(panes.sagittal).length).toBe(0);
  }, 60000);

  it('cuts the contours for a stack whose images do not lie in their plane', async function () {
    const sagittalPlane = {
      origin: [CENTER[0] + 6, 5, 66],
      rowCosines: [0, 1, 0],
      columnCosines: [0, 0, -1],
    };
    const series = await createSeries({
      id: 'contourCutsSagittalStack',
      plane: sagittalPlane,
      size: { ...SIZE, slices: 7 },
    });
    const viewport = createNextViewport(renderingEngine, 'contourCutsStack');

    ToolGroupManager.getToolGroup(toolGroupId).addViewport(
      viewport.id,
      renderingEngineId
    );
    await showStack(viewport, series, 3);
    addRtStructLikeSegmentation('cutsStack', {
      1: sphereContours(CENTER, RADIUS),
    });
    await showContours('cutsStack', [viewport]);
    await waitForShownContours(viewport);

    expectCutOfTheSphere(viewport, CENTER, RADIUS);
  }, 60000);
});
