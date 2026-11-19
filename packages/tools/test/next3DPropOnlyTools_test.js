import * as cornerstone3D from '@cornerstonejs/core';
import { mat4, vec3 } from 'gl-matrix';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import * as csTools3d from '../src/index';
import * as testUtils from '../../../utils/test/testUtils';

const { utilities, Enums, CONSTANTS, viewportProjection } = cornerstone3D;
const { ViewportType, OrientationAxis } = Enums;
const {
  TrackballRotateTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = csTools3d;
const { Events: csToolsEvents, MouseBindings } = csToolsEnums;

const renderingEngineId = utilities.uuidv4();
const toolGroupId = 'next3DPropOnly';
const viewportId = 'next3DPropOnly';
const CANVAS_SIZE = 400;
const CANVAS_CENTER = [CANVAS_SIZE / 2, CANVAS_SIZE / 2];
const SPHERE_RADIUS = 10;
const ROTATE_INCREMENT = 2;
const ZOOM_STEP = 20;
const ZOOM_STEPS = 4;

/**
 * Makes a next 3D viewport of 400 by 400 pixels on a black background whose
 * only content is a sphere of radius 10 at the world origin, a prop that the
 * application gave to the renderer, as the example
 * `polyDataActorManipulationTools` does: the prop goes in, the orientation is
 * sagittal, and a reset fits the camera to it.
 */
function createPropOnlyViewport(renderingEngine, parallelProjection) {
  const element = document.createElement('div');

  element.style.width = `${CANVAS_SIZE}px`;
  element.style.height = `${CANVAS_SIZE}px`;
  document.body.appendChild(element);
  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.VOLUME_3D,
    element,
    defaultOptions: {
      orientation: OrientationAxis.SAGITTAL,
      background: [0, 0, 0],
      parallelProjection,
    },
  });
  ToolGroupManager.getToolGroup(toolGroupId).addViewport(
    viewportId,
    renderingEngineId
  );

  const viewport = renderingEngine.getViewport(viewportId);
  const sphere = vtkSphereSource.newInstance({
    center: [0, 0, 0],
    radius: SPHERE_RADIUS,
    phiResolution: 20,
    thetaResolution: 20,
  });
  const mapper = vtkMapper.newInstance();
  const actor = vtkActor.newInstance();
  const { viewPlaneNormal, viewUp } = CONSTANTS.MPR_CAMERA_VALUES.sagittal;

  mapper.setInputConnection(sphere.getOutputPort());
  actor.setMapper(mapper);
  viewport.getRenderer().addActor(actor);
  viewport.setViewState({ viewPlaneNormal, viewUp });
  viewport.resetViewState();

  return viewport;
}

/** Renders the viewport and resolves when it is drawn. */
function renderAndWait(viewport) {
  return new Promise((resolve) => {
    viewport.element.addEventListener(Enums.Events.IMAGE_RENDERED, resolve, {
      once: true,
    });
    viewport.render();
  });
}

/** The number of pixels of the canvas that the sphere covers. */
function spherePixelCount(viewport) {
  const canvas = viewport.getCanvas();
  const { data } = canvas
    .getContext('2d')
    .getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] > 30) {
      count += 1;
    }
  }

  return count;
}

/**
 * Presses a mouse button at a canvas point of the element, moves the mouse in
 * equal steps, and releases it. Each move is sent when the tools have handled
 * the one before. Resolves when the tools have handled the release, which
 * they report as a click when it comes within the click delay of the press.
 * The errors that the listeners throw on the way are collected and returned.
 */
async function dragOnCanvas(element, start, step, steps, buttons) {
  const errors = [];
  const onError = (event) => {
    errors.push(event.error ?? event.message);
    event.preventDefault();
  };
  const rect = element.getBoundingClientRect();
  const toMouseInit = ([x, y]) => ({
    target: element,
    buttons,
    clientX: x + rect.left,
    clientY: y + rect.top,
    pageX: x + rect.left + window.pageXOffset,
    pageY: y + rect.top + window.pageYOffset,
  });
  const pressed = new Promise((resolve) => {
    element.addEventListener(csToolsEvents.MOUSE_DOWN, resolve, {
      once: true,
    });
  });
  const released = new Promise((resolve) => {
    element.addEventListener(csToolsEvents.MOUSE_UP, resolve, { once: true });
    element.addEventListener(csToolsEvents.MOUSE_CLICK, resolve, {
      once: true,
    });
  });

  window.addEventListener('error', onError);
  element.dispatchEvent(new MouseEvent('mousedown', toMouseInit(start)));
  await pressed;

  for (let i = 1; i <= steps; i++) {
    document.dispatchEvent(
      new MouseEvent(
        'mousemove',
        toMouseInit([start[0] + step[0] * i, start[1] + step[1] * i])
      )
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  document.dispatchEvent(new MouseEvent('mouseup', toMouseInit(start)));
  await released;
  window.removeEventListener('error', onError);

  return errors;
}

/**
 * The rotation that the tool applies for one drag event of `step` from the
 * centre of a canvas of 400 by 400 pixels, as `TrackballRotateTool` computes
 * it: about the view up by the angle of the horizontal move, then about the
 * view right of before the drag by the angle of the vertical move.
 */
function dragRotation({ viewPlaneNormal, viewUp }, step) {
  const previous = CANVAS_CENTER.map((value) => value / CANVAS_SIZE);
  const current = CANVAS_CENTER.map(
    (value, axis) => (value + step[axis]) / CANVAS_SIZE
  );
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

  return mat4.multiply(
    mat4.create(),
    mat4.fromRotation(mat4.create(), angleY, right),
    mat4.fromRotation(mat4.create(), angleX, forward)
  );
}

/** Checks that two world vectors are the same, to a thousandth. */
function expectVectorsToBeClose(actual, expected) {
  [0, 1, 2].forEach((axis) => {
    expect(actual[axis]).toBeCloseTo(expected[axis], 3);
  });
}

describe('Tools on a next 3D viewport whose only content is a prop of its renderer -- ', () => {
  let renderingEngine;

  beforeEach(function () {
    renderingEngine = testUtils.setupTestEnvironment({
      renderingEngineId,
      toolGroupIds: [toolGroupId],
      tools: [TrackballRotateTool, ZoomTool],
      toolActivations: {
        [TrackballRotateTool.toolName]: {
          bindings: [{ mouseButton: MouseBindings.Primary }],
        },
        [ZoomTool.toolName]: {
          bindings: [{ mouseButton: MouseBindings.Secondary }],
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

  it('turns the camera about the centre of the canvas with TrackballRotateTool, without an error at the mouse down', async function () {
    const viewport = createPropOnlyViewport(renderingEngine, true);

    await renderAndWait(viewport);

    const camera = viewport.getVtkActiveCamera();
    const before = {
      viewPlaneNormal: [...camera.getViewPlaneNormal()],
      viewUp: [...camera.getViewUp()],
      focalPoint: [...camera.getFocalPoint()],
    };
    const pivot = viewport.canvasToWorld(CANVAS_CENTER);
    const step = [20, 10];
    const rotation = dragRotation(before, step);
    const errors = await dragOnCanvas(
      viewport.element,
      CANVAS_CENTER,
      step,
      1,
      1
    );

    expect(errors).toEqual([]);
    expectVectorsToBeClose(
      camera.getViewUp(),
      vec3.transformMat4(vec3.create(), before.viewUp, rotation)
    );
    expectVectorsToBeClose(
      camera.getViewPlaneNormal(),
      vec3.transformMat4(vec3.create(), before.viewPlaneNormal, rotation)
    );
    expectVectorsToBeClose(viewport.canvasToWorld(CANVAS_CENTER), pivot);
  });

  [
    ['a parallel', true],
    ['a perspective', false],
  ].forEach(([name, parallelProjection]) => {
    it(`zooms ${name} camera towards the prop with ZoomTool, and the prop stays in view and grows`, async function () {
      const viewport = createPropOnlyViewport(
        renderingEngine,
        parallelProjection
      );

      await renderAndWait(viewport);

      const pixelsBefore = spherePixelCount(viewport);
      const zoomBefore = viewportProjection.getPresentation(viewport).zoom;
      const errors = await dragOnCanvas(
        viewport.element,
        CANVAS_CENTER,
        [0, ZOOM_STEP],
        ZOOM_STEPS,
        2
      );

      await renderAndWait(viewport);

      const zoomAfter = viewportProjection.getPresentation(viewport).zoom;
      const camera = viewport.getVtkActiveCamera();
      const distance = vec3.distance(camera.getPosition(), [0, 0, 0]);
      const [near, far] = camera.getClippingRange();

      expect(errors).toEqual([]);
      expect(zoomBefore).toBeCloseTo(1, 3);
      expect(zoomAfter).toBeCloseTo(
        (1 / (1 - (ZOOM_STEP * 5) / CANVAS_SIZE)) ** ZOOM_STEPS,
        3
      );
      expect(near).toBeLessThan(distance - SPHERE_RADIUS);
      expect(far).toBeGreaterThan(distance + SPHERE_RADIUS);
      expect(pixelsBefore).toBeGreaterThan(100);
      expect(spherePixelCount(viewport)).toBeGreaterThan(pixelsBefore);
    });
  });
});
