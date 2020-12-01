// @ts-ignore
import { BaseTool } from './base/index.ts';
// ~~ VTK Viewport
import { getEnabledElement } from './../../index';
// @ts-ignore
import Viewport from 'RenderingEngine/Viewport.ts';

export default class PanTool extends BaseTool {
  touchDragCallback: () => void;
  mouseDragCallback: () => void;

  constructor(toolConfiguration = {}) {
    const defaultToolConfiguration = {
      name: 'Pan',
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
    const { element: canvas, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(canvas);

    // TODO update camera/setCamera to map {x,y,z} format to array.
    const { x: deltaX, y: deltaY, z: deltaZ } = deltaPoints.world;
    const camera = enabledElement.viewport.getCamera();
    const { focalPoint, position } = camera;

    // TODO Not sure why this should be negative?
    // We should be adding on the delta I believe?
    // This is the same now as the vtkMouseCameraTrackballPanManipulator,
    // So the rest of the framework is at least consistent now.
    const updatedPosition = [
      position[0] - deltaX,
      position[1] - deltaY,
      position[2] - deltaZ,
    ];

    const updatedFocalPoint = [
      focalPoint[0] - deltaX,
      focalPoint[1] - deltaY,
      focalPoint[2] - deltaZ,
    ];

    enabledElement.viewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });
    enabledElement.viewport.render();
  }
}
