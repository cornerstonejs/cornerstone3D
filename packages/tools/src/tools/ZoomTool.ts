import { vec3 } from 'gl-matrix';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import { getEnabledElement, Types } from '@cornerstonejs/core';
import { BaseTool } from './base';

import { EventTypes, PublicToolProps, ToolProps } from '../types';

/**
 * ZoomTool tool manipulates the camera zoom applied to a viewport. It
 * provides a way to set the zoom of a viewport by dragging mouse over the image.
 *
 */
export default class ZoomTool extends BaseTool {
  static toolName = 'Zoom';
  touchDragCallback: () => void;
  mouseDragCallback: () => void;
  initialMousePosWorld: Types.Point3;
  dirVec: Types.Point3;

  // Apparently TS says super _must_ be the first call? This seems a bit opinionated.
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        // whether zoom to the center of the image OR zoom to the mouse position
        zoomToCenter: false,
        minZoomScale: 0.1,
        maxZoomScale: 30,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.initialMousePosWorld = [0, 0, 0];
    this.dirVec = [0, 0, 0];

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

  preMouseDownCallback = (
    evt: EventTypes.MouseDownActivateEventType
  ): boolean => {
    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);

    const camera = enabledElement.viewport.getCamera();
    const { focalPoint } = camera;

    this.initialMousePosWorld = worldPos;

    // The direction vector from the clicked location to the focal point
    // which would act as the vector to translate the image (if zoomToCenter is false)
    let dirVec = vec3.fromValues(
      focalPoint[0] - worldPos[0],
      focalPoint[1] - worldPos[1],
      focalPoint[2] - worldPos[2]
    );

    dirVec = vec3.normalize(vec3.create(), dirVec);

    this.dirVec = dirVec as Types.Point3;

    return true;
  };

  // Takes ICornerstoneEvent, Mouse or Touch
  _dragCallback(evt: EventTypes.MouseDragEventType) {
    const { element } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();

    if (camera.parallelProjection) {
      this._dragParallelProjection(evt, viewport, camera);
    } else {
      this._dragPerspectiveProjection(evt, viewport, camera);
    }

    viewport.render();
  }

  _dragParallelProjection = (
    evt: EventTypes.MouseDragEventType,
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    camera: Types.ICamera
  ): void => {
    const { element, deltaPoints } = evt.detail;

    const size = [element.clientWidth, element.clientHeight];
    const { parallelScale, focalPoint, position } = camera;

    const zoomScale = 1.5 / size[1];
    const deltaY = deltaPoints.canvas[1];
    const k = deltaY * zoomScale;

    let parallelScaleToSet = (1.0 - k) * parallelScale;

    let focalPointToSet = focalPoint;
    let positionToSet = position;

    // if we're not zooming to the center, we need to adjust the focal point
    // and position to set the focal point and position to the value that
    // would simulate the zoom to the mouse position
    if (!this.configuration.zoomToCenter) {
      // Distance of the initial mouse position (world) to the focal point
      // which is always the center of the canvas.
      const distanceToCanvasCenter = vec3.distance(
        focalPoint,
        this.initialMousePosWorld
      );
      // const initialYDistanceBetweenInitialAndFocalPoint;

      // we need to move in the direction of the vector between the focal point
      // and the initial mouse position by some amount until ultimately we
      // reach the mouse position at the focal point
      const zoomScale = 5 / size[1];
      const k = deltaY * zoomScale;
      parallelScaleToSet = (1.0 - k) * parallelScale;

      positionToSet = vec3.scaleAndAdd(
        vec3.create(),
        position,
        this.dirVec,
        -distanceToCanvasCenter * k
      ) as Types.Point3;

      focalPointToSet = vec3.scaleAndAdd(
        vec3.create(),
        focalPoint,
        this.dirVec,
        -distanceToCanvasCenter * k
      ) as Types.Point3;
    }

    // If it is a regular GPU accelerated viewport, then parallel scale
    // has a physical meaning and we can use that to determine the threshold
    const imageData = viewport.getImageData();

    const { spacing } = imageData;
    const { minZoomScale, maxZoomScale } = this.configuration;

    const t = element.clientHeight * spacing[1] * 0.5;
    const scale = t / parallelScaleToSet;

    let cappedParallelScale = parallelScaleToSet;
    let thresholdExceeded = false;

    if (scale < minZoomScale) {
      cappedParallelScale = t / minZoomScale;
      thresholdExceeded = true;
    } else if (scale >= maxZoomScale) {
      cappedParallelScale = t / maxZoomScale;
      thresholdExceeded = true;
    }

    viewport.setCamera({
      parallelScale: cappedParallelScale,
      focalPoint: thresholdExceeded ? focalPoint : focalPointToSet,
      position: thresholdExceeded ? position : positionToSet,
    });
  };

  _dragPerspectiveProjection = (evt, viewport, camera) => {
    const { element, deltaPoints } = evt.detail;
    const size = [element.clientWidth, element.clientHeight];
    const { position, focalPoint, viewPlaneNormal } = camera;

    const distance = vtkMath.distance2BetweenPoints(position, focalPoint);
    const zoomScale = Math.sqrt(distance) / size[1];

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
