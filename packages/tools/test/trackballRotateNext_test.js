import * as cornerstone3D from '@cornerstonejs/core';
import { mat4, vec3 } from 'gl-matrix';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';
import { createNextPlanarViewport } from './nextLabelmapScenes';

const { utilities, Enums, volumeLoader, cache } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const {
  TrackballRotateTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = csTools3d;
const { Events: csToolsEvents } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'trackballRotateNext';
const viewportId = 'trackballRotateNext';
const CANVAS_SIZE = 400;
const CANVAS_CENTER = [CANVAS_SIZE / 2, CANVAS_SIZE / 2];
const DRAG_START = [200, 200];
const DRAG_END = [220, 210];
const ROTATE_INCREMENT = 2;

/** Makes a volume of 64 columns, 60 rows and 20 slices of 1 mm. */
async function createVolume() {
  const volumeId = testUtils.encodeVolumeIdInfo({
    loader: 'fakeVolumeLoader',
    name: 'volumeURI',
    rows: 60,
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
 * Drags the first mouse button from one canvas point to another in one move:
 * the press, and when the tools have handled it the move and the release. It
 * resolves when the tools have handled the release.
 */
function dragOnCanvas(element, startCanvas, endCanvas) {
  const rect = element.getBoundingClientRect();
  const toMouseInit = ([x, y]) => ({
    target: element,
    buttons: 1,
    clientX: x + rect.left,
    clientY: y + rect.top,
    pageX: x + rect.left + window.pageXOffset,
    pageY: y + rect.top + window.pageYOffset,
  });
  const released = new Promise((resolve) => {
    element.addEventListener(csToolsEvents.MOUSE_UP, resolve, { once: true });
  });

  element.addEventListener(
    csToolsEvents.MOUSE_DOWN,
    () => {
      document.dispatchEvent(
        new MouseEvent('mousemove', toMouseInit(endCanvas))
      );
      document.dispatchEvent(new MouseEvent('mouseup'));
    },
    { once: true }
  );
  element.dispatchEvent(new MouseEvent('mousedown', toMouseInit(startCanvas)));

  return released;
}

/**
 * The rotation that the legacy tool applied for one drag event on a canvas
 * of 400 by 400 pixels, read in `TrackballRotateTool` of commit 58914567b:
 * first about the view up by the angle of the horizontal move, then about the
 * view right of before the drag by the angle of the vertical move. Both turn
 * the camera about the world point at the centre of the canvas.
 */
function legacyDragRotation({ viewPlaneNormal, viewUp }) {
  const previous = DRAG_START.map((value) => value / CANVAS_SIZE);
  const current = DRAG_END.map((value) => value / CANVAS_SIZE);
  const radiusSquared = 1.5 ** 2;
  const onSphere = (x) =>
    vec3.normalize(vec3.create(), [x, 0, Math.sqrt(radiusSquared - x * x)]);
  const cosine = vec3.dot(onSphere(previous[0]), onSphere(current[0]));
  const angleX =
    -2 *
    Math.acos(Math.min(1, Math.max(-1, cosine))) *
    Math.sign(current[0] - previous[0]) *
    ROTATE_INCREMENT;
  const angleY = (previous[1] - current[1]) * ROTATE_INCREMENT;
  const right = vec3.normalize(
    vec3.create(),
    vec3.cross(vec3.create(), viewUp, viewPlaneNormal)
  );
  const forward = vec3.normalize(
    vec3.create(),
    vec3.cross(vec3.create(), viewPlaneNormal, right)
  );
  const aboutForward = mat4.fromRotation(mat4.create(), angleX, forward);
  const aboutRight = mat4.fromRotation(mat4.create(), angleY, right);

  return mat4.multiply(mat4.create(), aboutRight, aboutForward);
}

/** Checks that two world vectors are the same, to a thousandth. */
function expectVectorsToBeClose(actual, expected, precision = 3) {
  expect(actual).toBeDefined();
  [0, 1, 2].forEach((axis) => {
    expect(actual[axis]).toBeCloseTo(expected[axis], precision);
  });
}

/**
 * The view of a planar viewport as a picture has it: the two view vectors,
 * the world point at the centre of the canvas, and the mm of one pixel.
 */
function readPlanarView(viewport) {
  const { viewPlaneNormal, viewUp } = viewport.getViewReference();

  return {
    viewPlaneNormal,
    viewUp,
    centerWorld: viewport.canvasToWorld(CANVAS_CENTER),
    pixelSize: vec3.distance(
      viewport.canvasToWorld([0, 0]),
      viewport.canvasToWorld([0, 1])
    ),
  };
}

/**
 * Checks that a planar view was turned from `before` as the legacy tool
 * turned it for the drag: the view vectors by the rotation of the drag, the
 * world point at the centre of the canvas where it was, the size of a pixel
 * as it was, and the canvas on the plane through that point.
 */
function expectLegacyTurn(viewport, before) {
  const rotation = legacyDragRotation(before);
  const after = readPlanarView(viewport);
  const cornerFromCenter = vec3.subtract(
    vec3.create(),
    viewport.canvasToWorld([0, 0]),
    after.centerWorld
  );

  expectVectorsToBeClose(
    after.viewPlaneNormal,
    vec3.transformMat4(vec3.create(), before.viewPlaneNormal, rotation)
  );
  expectVectorsToBeClose(
    after.viewUp,
    vec3.transformMat4(vec3.create(), before.viewUp, rotation)
  );
  expect(Math.abs(after.viewPlaneNormal[2])).toBeLessThan(0.999);
  expectVectorsToBeClose(after.centerWorld, before.centerWorld, 2);
  expect(after.pixelSize).toBeCloseTo(before.pixelSize, 3);
  expect(vec3.dot(cornerFromCenter, after.viewPlaneNormal)).toBeCloseTo(0, 2);
}

/** Resolves when a resize observer of the page has had time to run. */
function waitForResizeObserver() {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

describe('TrackballRotateTool on a direct next viewport -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [TrackballRotateTool],
      toolActivations: {
        [TrackballRotateTool.toolName]: { bindings: [{ mouseButton: 1 }] },
      },
      viewportIds: [viewportId],
    }).renderingEngine;
  });

  afterEach(function () {
    testUtils.cleanupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
    });
  });

  [
    ['a view that is not panned', {}],
    ['a panned view', { pan: [30, -20] }],
    ['a view that is drawn on the CPU', { renderBackend: 'cpu' }],
  ].forEach(([name, { pan, renderBackend }]) => {
    it(`turns ${name} of a planar viewport in volume mode as the legacy tool did: about the point at the centre of the canvas, and the cut follows`, async function () {
      const viewport = createNextPlanarViewport(renderingEngine, viewportId);

      await testUtils.setVolumesOnNextViewport(
        viewport,
        [await createVolume()],
        renderBackend ? { renderBackend } : {}
      );
      expect(viewport.getCurrentMode()).toBe('volume');

      if (renderBackend === 'cpu') {
        testUtils.expectNextViewportToDrawOnCPU(viewport);
      }

      if (pan) {
        viewport.setPan(pan);
        viewport.render();
      }

      const before = readPlanarView(viewport);

      await dragOnCanvas(viewport.element, DRAG_START, DRAG_END);
      expectLegacyTurn(viewport, before);
    });
  });

  it('turns the view of a legacy adapter that shows a volume as that of a direct next viewport', async function () {
    testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.ORTHOGRAPHIC,
      orientation: OrientationAxis.AXIAL,
      viewportId,
    });

    const viewport = renderingEngine.getViewport(viewportId);

    await viewport.setVolumes([{ volumeId: await createVolume() }]);
    viewport.render();

    const before = readPlanarView(viewport);

    await dragOnCanvas(viewport.element, DRAG_START, DRAG_END);
    expectLegacyTurn(viewport, before);
  });

  it('keeps the turned view when the element is resized', async function () {
    const viewport = createNextPlanarViewport(renderingEngine, viewportId);

    await testUtils.setVolumesOnNextViewport(viewport, [await createVolume()]);
    ToolGroupManager.getToolGroup(toolGroupId).setToolActive(
      TrackballRotateTool.toolName,
      { bindings: [{ mouseButton: 1 }] }
    );
    await waitForResizeObserver();

    const before = readPlanarView(viewport);

    await dragOnCanvas(viewport.element, DRAG_START, DRAG_END);

    const turned = readPlanarView(viewport);

    viewport.element.style.width = '500px';
    viewport.element.style.height = '300px';
    renderingEngine.resize(true, true);
    await waitForResizeObserver();

    const resized = viewport.getViewReference();

    expect(Math.abs(turned.viewPlaneNormal[2])).toBeLessThan(0.999);
    expectVectorsToBeClose(resized.viewPlaneNormal, turned.viewPlaneNormal);
    expectVectorsToBeClose(resized.viewUp, turned.viewUp);
    expectVectorsToBeClose(
      turned.viewPlaneNormal,
      vec3.transformMat4(
        vec3.create(),
        before.viewPlaneNormal,
        legacyDragRotation(before)
      )
    );
  });

  it('does nothing on a planar viewport in stack mode, where an orientation cannot change, and does not throw', async function () {
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

    const before = readPlanarView(viewport);

    await dragOnCanvas(viewport.element, DRAG_START, DRAG_END);

    const after = readPlanarView(viewport);

    expectVectorsToBeClose(after.viewPlaneNormal, before.viewPlaneNormal);
    expectVectorsToBeClose(after.viewUp, before.viewUp);
    expectVectorsToBeClose(after.centerWorld, before.centerWorld);
    expect(after.pixelSize).toBeCloseTo(before.pixelSize, 5);
    expect(viewport.getCurrentImageIdIndex()).toBe(1);
  });

  it('turns the camera of a 3D viewport about the point at the centre of the canvas', async function () {
    testUtils.createViewports(renderingEngine, {
      viewportType: ViewportType.VOLUME_3D_NEXT,
      orientation: OrientationAxis.SAGITTAL,
      viewportId,
      useEnableElement: true,
    });

    const viewport = renderingEngine.getViewport(viewportId);
    const volumeId = await createVolume();

    utilities.genericViewportDisplaySetMetadataProvider.add(
      'trackballRotateNext3D',
      { imageIds: cache.getVolume(volumeId).imageIds, volumeId }
    );
    await viewport.setDisplaySets({
      displaySetId: 'trackballRotateNext3D',
      options: { renderMode: 'vtkVolume3d' },
    });
    viewport.render();

    const camera = viewport.getVtkActiveCamera();
    const before = {
      viewPlaneNormal: [...camera.getViewPlaneNormal()],
      viewUp: [...camera.getViewUp()],
      position: [...camera.getPosition()],
      focalPoint: [...camera.getFocalPoint()],
    };
    const pivot = viewport.canvasToWorld(CANVAS_CENTER);
    const rotation = legacyDragRotation(before);
    const aboutPivot = mat4.create();

    mat4.translate(aboutPivot, aboutPivot, pivot);
    mat4.multiply(aboutPivot, aboutPivot, rotation);
    mat4.translate(aboutPivot, aboutPivot, vec3.negate(vec3.create(), pivot));

    await dragOnCanvas(viewport.element, DRAG_START, DRAG_END);

    expectVectorsToBeClose(
      camera.getViewUp(),
      vec3.transformMat4(vec3.create(), before.viewUp, rotation)
    );
    expectVectorsToBeClose(
      camera.getPosition(),
      vec3.transformMat4(vec3.create(), before.position, aboutPivot),
      2
    );
    expectVectorsToBeClose(
      camera.getFocalPoint(),
      vec3.transformMat4(vec3.create(), before.focalPoint, aboutPivot),
      2
    );
  });
});
