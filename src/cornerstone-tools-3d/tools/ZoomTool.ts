// @ts-ignore
import { BaseTool } from './base/index.ts';
// ~~ VTK Viewport
import { getEnabledElement } from './../../index';

export default class ZoomTool extends BaseTool {
  touchDragCallback: Function;
  mouseDragCallback: Function;

  // @ts-ignore // Apparently TS says super _must_ be the first call? This seems a bit opinionated.
  constructor(toolConfiguration = {}) {
    const defaultToolConfiguration = {
      name: 'Zoom',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    };

    super(toolConfiguration, defaultToolConfiguration);

    /**
     * Will only fire fore cornerstone events:
     * - TOUCH_DRAG
     * - MOUSE_DRAG
     *
     * Given that the tool is active and has matching bindings for the
     * underlying touch/mouse event.
     */
    this.touchDragCallback = this._dragCallback.bind(this);
    this.mouseDragCallback = this._dragCallback.bind(this);
  }

  // Takes ICornerstoneEvent, Mouse or Touch
  _dragCallback(evt) {
    const { element: canvas } = evt.detail;
    const enabledElement = getEnabledElement(canvas);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();

    if (camera.parallelProjection) {
      this._dragParallelProjection(evt, camera);
    } else {
      this._dragPerspectiveProjection(evt, camera);
    }

    viewport.render();
  }

  _dragParallelProjection = (evt, camera) => {
    const { element: canvas, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(canvas);
    const { viewport } = enabledElement;
    const size = [canvas.clientWidth, canvas.clientHeight];

    const zoomScale = 1.5 / size[1];

    const { y: deltaY } = deltaPoints.canvas;

    const k = deltaY * zoomScale;

    viewport.setCamera({ parallelScale: (1.0 - k) * camera.parallelScale });
  };

  _dragPerspectiveProjection = (evt, camera) => {
    const { element: canvas, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(canvas);
    const { viewport } = enabledElement;
    const size = [canvas.clientWidth, canvas.clientHeight];

    const range = camera.clippingRange;
    const zoomScale = 1.5 * (range[1] / size[1]);

    const { position, focalPoint, viewPlaneNormal } = camera;

    const directionOfProjection = [
      -viewPlaneNormal[0],
      -viewPlaneNormal[1],
      -viewPlaneNormal[2],
    ];

    const { y: deltaY } = deltaPoints.canvas;

    const k = deltaY * zoomScale;

    let tmp = k * directionOfProjection[0];
    position[0] += tmp;
    focalPoint[0] += tmp;

    tmp = k * directionOfProjection[1];
    position[1] += tmp;
    focalPoint[1] += tmp;

    tmp = k * directionOfProjection[2];
    position[2] += tmp;
    focalPoint[2] += tmp;

    viewport.setCamera({ position, focalPoint });
  };
}
