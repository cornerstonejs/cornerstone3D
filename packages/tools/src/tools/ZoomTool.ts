import { vec3 } from 'gl-matrix';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import {
  getConfiguration,
  type Types,
  viewportHasPan,
  viewportHasZoom,
} from '@cornerstonejs/core';
import { Enums, getEnabledElement } from '@cornerstonejs/core';
import { BaseTool } from './base';
import type { EventTypes, PublicToolProps, ToolProps } from '../types';
import { Events } from '../enums';

/**
 * ZoomTool tool manipulates the camera zoom applied to a viewport. It
 * provides a way to set the zoom of a viewport by dragging mouse over the image.
 *
 */
class ZoomTool extends BaseTool {
  static toolName;
  touchDragCallback: (evt: EventTypes.InteractionEventType) => void;
  mouseDragCallback: (evt: EventTypes.InteractionEventType) => void;
  initialMousePosWorld: Types.Point3;
  dirVec: Types.Point3;

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
    this.initialMousePosWorld = [0, 0, 0];
    this.dirVec = [0, 0, 0];
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

  preMouseDownCallback = (evt: EventTypes.InteractionEventType): boolean => {
    const eventData = evt.detail;
    const { element, currentPoints } = eventData;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const viewport = enabledElement.viewport;

    const camera = viewport.getCamera();

    if (!hasLegacyCameraPosition(camera)) {
      return false;
    }

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

    // we should not return true here, returning true in the preMouseDownCallback
    // means that the event is handled by the tool and no other methods
    // can claim the event, which will result in a bug where having Zoom on primary
    // and clicking on an annotation will not manipulate the annotation, but will
    // instead zoom the image (which is not what we want), so we return false here
    return false;
  };

  preTouchStartCallback = (evt: EventTypes.InteractionEventType): boolean => {
    if (!this.configuration.pinchToZoom) {
      return this.preMouseDownCallback(evt);
    }
  };

  _pinchCallback(evt: EventTypes.InteractionEventType) {
    const pointsList = (evt as EventTypes.TouchStartEventType).detail
      .currentPointsList;

    if (pointsList.length > 1) {
      const { element, currentPoints } = evt.detail;
      const enabledElement = getEnabledElement(element);
      const { viewport } = enabledElement;
      const camera = viewport.getCamera();
      const worldPos = currentPoints.world;
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
      if (camera.parallelProjection) {
        this._dragParallelProjection(evt, viewport, camera, true);
      } else {
        this._dragPerspectiveProjection(evt, viewport, camera, true);
      }
      viewport.render();
    }

    if (this.configuration.pan) {
      this._panCallback(evt);
    }
  }

  // Takes ICornerstoneEvent, Mouse or Touch
  _dragCallback(evt: EventTypes.InteractionEventType) {
    const { element } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();

    if (!hasLegacyParallelCamera(camera)) {
      if (!viewportHasZoom(viewport)) {
        return;
      }

      this._dragViewportZoom(evt, viewport);
    } else if (camera.parallelProjection) {
      this._dragParallelProjection(evt, viewport, camera);
    } else {
      this._dragPerspectiveProjection(evt, viewport, camera);
    }

    viewport.render();
  }

  _dragParallelProjection = (
    evt: EventTypes.InteractionEventType,
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    camera: Types.ICamera,
    pinch = false
  ): void => {
    const { element, deltaPoints } = evt.detail;
    const deltaY = pinch
      ? (evt as EventTypes.TouchDragEventType).detail.deltaDistance.canvas
      : deltaPoints.canvas[1];

    const size = [element.clientWidth, element.clientHeight];
    const { parallelScale, focalPoint, position } = camera;

    const zoomScale = 5 / size[1];
    const k = deltaY * zoomScale * (this.configuration.invert ? -1 : 1);

    const parallelScaleToSet = (1.0 - k) * parallelScale;

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
    // Added spacing preset in case there is no imageData on viewport
    const imageData = viewport.getImageData();
    let spacing = [1, 1, 1];
    let cappedParallelScale = parallelScaleToSet;
    let thresholdExceeded = false;

    if (imageData) {
      spacing = imageData.spacing;

      const { dimensions } = imageData;
      const imageWidth = dimensions[0] * spacing[0];
      const imageHeight = dimensions[1] * spacing[1];

      const canvasAspect = size[0] / size[1];

      const insetImageMultiplier = getConfiguration().rendering
        ?.useLegacyCameraFOV
        ? 1.1
        : 1;

      // Get display area, if available
      const displayArea = viewport.options?.displayArea;
      const imageAreaScaleX =
        displayArea?.imageArea?.[0] ?? insetImageMultiplier;
      const imageAreaScaleY =
        displayArea?.imageArea?.[1] ?? insetImageMultiplier;

      // Adjust image dimensions by display area scale
      const scaledImageWidth = imageWidth * imageAreaScaleX;
      const scaledImageHeight = imageHeight * imageAreaScaleY;
      const scaledImageAspect = scaledImageWidth / scaledImageHeight;

      // Determine the minimum parallel scale required to fully fit the image
      let minParallelScaleRequired;
      if (scaledImageAspect > canvasAspect) {
        // Wider image, limit by width
        minParallelScaleRequired = (scaledImageWidth / canvasAspect) * 0.5;
      } else {
        // Taller image, limit by height
        minParallelScaleRequired = scaledImageHeight * 0.5;
      }

      const { minZoomScale, maxZoomScale } = this.configuration;

      // Translate zoom scale limits to world-space scale
      const minScaleInWorld = minParallelScaleRequired / maxZoomScale;
      const maxScaleInWorld = minParallelScaleRequired / minZoomScale;

      // Clamp zoom within allowed limits
      if (parallelScaleToSet < minScaleInWorld) {
        cappedParallelScale = minScaleInWorld;
        thresholdExceeded = true;
      } else if (parallelScaleToSet > maxScaleInWorld) {
        cappedParallelScale = maxScaleInWorld;
        thresholdExceeded = true;
      }
    }

    viewport.setCamera({
      parallelScale: cappedParallelScale,
      focalPoint: thresholdExceeded ? focalPoint : focalPointToSet,
      position: thresholdExceeded ? position : positionToSet,
    });
  };

  _dragPerspectiveProjection = (
    evt: EventTypes.InteractionEventType,
    viewport: Types.IStackViewport | Types.IVolumeViewport,
    camera: Types.ICamera,
    pinch = false
  ): void => {
    const { element, deltaPoints } = evt.detail;
    const deltaY = pinch
      ? (evt as EventTypes.TouchDragEventType).detail.deltaDistance.canvas
      : deltaPoints.canvas[1];

    const size = [element.clientWidth, element.clientHeight];
    const { position, focalPoint, viewPlaneNormal } = camera;

    const distance = vtkMath.distance2BetweenPoints(position, focalPoint);
    const zoomScale = Math.sqrt(distance) / size[1];

    const directionOfProjection = [
      -viewPlaneNormal[0],
      -viewPlaneNormal[1],
      -viewPlaneNormal[2],
    ];

    const k = this.configuration.invert
      ? deltaY / zoomScale
      : deltaY * zoomScale;

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

  _zoom(evt: EventTypes.MouseWheelEventType): void {
    const { element, points } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const camera = viewport.getCamera();
    const wheelData = evt.detail.wheel;
    const direction = wheelData.direction;

    if (!hasLegacyParallelCamera(camera)) {
      if (!viewportHasZoom(viewport)) {
        return;
      }

      const canvasPoint = this.configuration.zoomToCenter
        ? undefined
        : (points.canvas as Types.Point2);

      this._applyViewportZoomDelta(
        viewport,
        element,
        -direction * 5,
        canvasPoint
      );
      viewport.render();
      return;
    }

    // Fake event to simulate a drag event
    const eventDetails = {
      detail: {
        element,
        eventName: Events.MOUSE_WHEEL,
        renderingEngineId: enabledElement.renderingEngineId,
        viewportId: viewport.id,
        camera: {},
        deltaPoints: {
          page: points.page as Types.Point2,
          client: points.client as Types.Point2,
          world: points.world as Types.Point3,
          canvas: [0, -direction * 5] as Types.Point2, // Simulate a drag of 5 pixels up or down
        },
        startPoints: points,
        lastPoints: points,
        currentPoints: points,
      },
    } as EventTypes.InteractionEventType;

    if (viewport.type === Enums.ViewportType.STACK) {
      this.preMouseDownCallback(eventDetails);
    }

    this._dragCallback(eventDetails);
  }

  _panCallback(evt: EventTypes.InteractionEventType) {
    const { element, deltaPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);

    const deltaPointsWorld = deltaPoints.world;
    const viewport = enabledElement.viewport;
    const camera = viewport.getCamera();

    if (!hasLegacyCameraPosition(camera)) {
      if (!viewportHasPan(viewport)) {
        return;
      }

      const pan = viewport.getPan();
      viewport.setPan([
        pan[0] + deltaPoints.canvas[0],
        pan[1] + deltaPoints.canvas[1],
      ]);
      viewport.render();
      return;
    }

    const { focalPoint, position } = camera;

    const updatedPosition = <Types.Point3>[
      position[0] - deltaPointsWorld[0],
      position[1] - deltaPointsWorld[1],
      position[2] - deltaPointsWorld[2],
    ];

    const updatedFocalPoint = <Types.Point3>[
      focalPoint[0] - deltaPointsWorld[0],
      focalPoint[1] - deltaPointsWorld[1],
      focalPoint[2] - deltaPointsWorld[2],
    ];

    viewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });
    viewport.render();
  }

  _dragViewportZoom(
    evt: EventTypes.InteractionEventType,
    viewport: { getZoom(): number; setZoom(...args: unknown[]): void }
  ): void {
    const { element, deltaPoints, startPoints } = evt.detail;
    const canvasPoint = this.configuration.zoomToCenter
      ? undefined
      : startPoints?.canvas;

    this._applyViewportZoomDelta(
      viewport,
      element,
      deltaPoints.canvas[1],
      canvasPoint
    );
  }

  _applyViewportZoomDelta(
    viewport: { getZoom(): number; setZoom(...args: unknown[]): void },
    element: HTMLDivElement,
    deltaY: number,
    canvasPoint?: Types.Point2
  ): void {
    const currentZoom = viewport.getZoom();
    const zoomScale = 5 / Math.max(element.clientHeight, 1);
    const k = deltaY * zoomScale * (this.configuration.invert ? -1 : 1);
    const denominator = Math.max(1 - k, 0.01);
    const unclampedZoom = currentZoom / denominator;
    const zoom = Math.min(
      Math.max(unclampedZoom, this.configuration.minZoomScale),
      this.configuration.maxZoomScale
    );

    viewport.setZoom(zoom, canvasPoint);
  }
}

function hasLegacyCameraPosition(
  camera: unknown
): camera is Pick<Types.ICamera, 'focalPoint' | 'position'> {
  return Boolean(
    camera &&
      Array.isArray((camera as Types.ICamera).focalPoint) &&
      Array.isArray((camera as Types.ICamera).position)
  );
}

function hasLegacyParallelCamera(camera: unknown): camera is Types.ICamera {
  return Boolean(
    hasLegacyCameraPosition(camera) &&
      typeof (camera as Types.ICamera).parallelProjection === 'boolean' &&
      typeof (camera as Types.ICamera).parallelScale === 'number' &&
      Array.isArray((camera as Types.ICamera).viewPlaneNormal)
  );
}

ZoomTool.toolName = 'Zoom';
export default ZoomTool;
