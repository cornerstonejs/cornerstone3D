import { type Types } from '@cornerstonejs/core';
import { getEnabledElement } from '@cornerstonejs/core';
import { BaseTool } from './base';
import type { EventTypes, PublicToolProps, ToolProps } from '../types';
import {
  getViewportZoomPan,
  panViewportByCanvasDelta,
  zoomViewportAtCanvasPoint,
} from '../utilities/viewportPresentation';

/**
 * ZoomTool tool manipulates the camera zoom applied to a viewport. It
 * provides a way to set the zoom of a viewport by dragging mouse over the image.
 *
 */
class ZoomTool extends BaseTool {
  static toolName;
  touchDragCallback: (evt: EventTypes.InteractionEventType) => void;
  mouseDragCallback: (evt: EventTypes.InteractionEventType) => void;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        // whether zoom to the center of the image OR zoom to the mouse position
        zoomToCenter: false,
        // Use large ranges to allow for microscopy viewing.
        // TODO: Change the definitions of these to be relative to 1:1 pixel and
        // relative to scale to fit sizing
        minZoomScale: 0.001,
        maxZoomScale: 3000,
        pinchToZoom: true,
        pan: true,
        invert: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    if (this.configuration.pinchToZoom) {
      this.touchDragCallback = this._pinchCallback.bind(this);
    } else {
      this.touchDragCallback = this._dragCallback.bind(this);
    }
    this.mouseDragCallback = this._dragCallback.bind(this);
  }

  mouseWheelCallback(evt: EventTypes.MouseWheelEventType) {
    this._zoom(evt);
  }

  _pinchCallback(evt: EventTypes.InteractionEventType) {
    const pointsList = (evt as EventTypes.TouchStartEventType).detail
      .currentPointsList;

    if (pointsList.length > 1) {
      const { element } = evt.detail;
      const { viewport } = getEnabledElement(element);

      if (this._dragViewportZoom(evt, viewport, true)) {
        viewport.render();
      }
    }

    if (this.configuration.pan) {
      this._panCallback(evt);
    }
  }

  // Takes ICornerstoneEvent, Mouse or Touch
  _dragCallback(evt: EventTypes.InteractionEventType) {
    const { element } = evt.detail;
    const { viewport } = getEnabledElement(element);

    if (this._dragViewportZoom(evt, viewport)) {
      viewport.render();
    }
  }

  _zoom(evt: EventTypes.MouseWheelEventType): void {
    const { element, points } = evt.detail;
    const { viewport } = getEnabledElement(element);
    const direction = evt.detail.wheel.direction;
    const canvasPoint = this.configuration.zoomToCenter
      ? undefined
      : (points.canvas as Types.Point2);

    if (
      this._applyViewportZoomDelta(
        viewport,
        element,
        -direction * 5,
        canvasPoint
      )
    ) {
      viewport.render();
    }
  }

  _panCallback(evt: EventTypes.InteractionEventType) {
    const { element, deltaPoints } = evt.detail;
    const { viewport } = getEnabledElement(element);

    if (panViewportByCanvasDelta(viewport, deltaPoints.canvas)) {
      viewport.render();
    }
  }

  /**
   * Zooms a viewport of any family through the projection service. A drag
   * zooms by its vertical movement. A pinch zooms by the change of the
   * distance between the two fingers.
   *
   * @returns False when the viewport has no zoom in the projection service.
   */
  _dragViewportZoom(
    evt: EventTypes.InteractionEventType,
    viewport: Types.IViewport,
    pinch = false
  ): boolean {
    const { element, deltaPoints, startPoints } = evt.detail;
    const canvasPoint = this.configuration.zoomToCenter
      ? undefined
      : startPoints?.canvas;
    const deltaY = pinch
      ? (evt as EventTypes.TouchDragEventType).detail.deltaDistance.canvas
      : deltaPoints.canvas[1];

    return this._applyViewportZoomDelta(viewport, element, deltaY, canvasPoint);
  }

  /**
   * Changes the zoom of a viewport by a vertical movement in canvas
   * pixels, inside `minZoomScale` and `maxZoomScale` of the configuration.
   * The zoom is the one of the projection service: 1 is the fit of the
   * viewport. With a canvas point the picture stays under it.
   *
   * @returns False when the viewport has no zoom in the projection service.
   */
  _applyViewportZoomDelta(
    viewport: Types.IViewport,
    element: HTMLDivElement,
    deltaY: number,
    canvasPoint?: Types.Point2
  ): boolean {
    const currentZoom = getViewportZoomPan(viewport)?.zoom;

    if (currentZoom === undefined) {
      return false;
    }

    const zoomScale = 5 / Math.max(element.clientHeight, 1);
    const k = deltaY * zoomScale * (this.configuration.invert ? -1 : 1);
    const denominator = Math.max(1 - k, 0.01);
    const unclampedZoom = currentZoom / denominator;
    const zoom = Math.min(
      Math.max(unclampedZoom, this.configuration.minZoomScale),
      this.configuration.maxZoomScale
    );

    return zoomViewportAtCanvasPoint(viewport, zoom, canvasPoint);
  }
}

ZoomTool.toolName = 'Zoom';
export default ZoomTool;
