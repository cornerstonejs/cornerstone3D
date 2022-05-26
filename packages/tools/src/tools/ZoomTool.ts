import { BaseTool } from './base';

import { getEnabledElement } from '@cornerstonejs/core';
import { PublicToolProps, ToolProps } from '../types';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';

/**
 * ZoomTool tool manipulates the camera zoom applied to a viewport. It
 * provides a way to set the zoom of a viewport by dragging mouse over the image.
 *
 */
export default class ZoomTool extends BaseTool {
  static toolName = 'Zoom';
  touchDragCallback: () => void;
  mouseDragCallback: () => void;

  // Apparently TS says super _must_ be the first call? This seems a bit opinionated.
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
    }
  ) {
    super(toolProps, defaultToolProps);

    /**
     * Will only fire two cornerstone events:
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
    const { element } = evt.detail;
    const enabledElement = getEnabledElement(element);
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
    const { element, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const size = [element.clientWidth, element.clientHeight];

    const zoomScale = 1.5 / size[1];

    const deltaY = deltaPoints.canvas[1];

    const k = deltaY * zoomScale;

    const newParallelScale = (1.0 - k) * camera.parallelScale;

    viewport.setCamera({ parallelScale: newParallelScale });
  };

  _dragPerspectiveProjection = (evt, camera) => {
    const { element, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const size = [element.clientWidth, element.clientHeight];
    const { position, focalPoint, viewPlaneNormal } = camera;

    const distance = vtkMath.distance2BetweenPoints(position, focalPoint);
    const zoomScale = 0.01 * (distance / size[1]);

    const directionOfProjection = [
      -viewPlaneNormal[0],
      -viewPlaneNormal[1],
      -viewPlaneNormal[2],
    ];

    const deltaY = deltaPoints.canvas[1];

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
