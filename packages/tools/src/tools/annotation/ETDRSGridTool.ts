import { AnnotationTool } from '../base';

import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import { triggerAnnotationCompleted } from '../../stateManagement/annotation/helpers/state';
import { drawCircle as drawCircleSvg, drawLine } from '../../drawingSvg';
import { state } from '../../store';
import { Events } from '../../enums';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';
import {
  EventTypes,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../../types';
import { Annotation } from '../../types/AnnotationTypes';

import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import { getCanvasCircleRadius } from '../../utilities/math/circle';
import { vec3 } from 'gl-matrix';

const CROSSHAIR_SIZE = 5;

export interface ETDRSGridAnnotation extends Annotation {
  data: {
    handles: {
      points: [Types.Point3]; // [center, end]
    };
  };
}

/**
 * This tool aims to implement the drawing capabilities of an ETDRS Grid to CS3D.
 * An ETDRS Grid (Early Treatment Diabetic Retinopathy Study Grid) is a standardized
 * grid used in ophthalmology to assess macular thickness and retinal changes.
 * It divides the macula into three concentric regions: the central subfield (1 mm),
 * the inner ring (3 mm), and the outer ring (6 mm), often further divided into quadrants.
 * The grid facilitates consistent measurement and comparison of retinal areas, aiding in
 * the diagnosis and monitoring of conditions like diabetic macular edema.
 * It allows the customization of the diameter of the concentric rings and the
 * angles of the quadrant lines.
 */

class ETDRSGridTool extends AnnotationTool {
  static toolName;

  touchDragCallback: any;
  mouseDragCallback: any;
  editData: {
    annotation: any;
    viewportIdsToRender: Array<string>;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage = false;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
        degrees: [45, 135, 225, 315],
        diameters: [10, 30, 60],
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a ETDRS Grid Annotation and stores it in the annotationManager
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): ETDRSGridAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
        ...viewport.getViewReference({ points: [worldPos] }),
      },
      data: {
        label: '',
        handles: {
          points: [[...worldPos]] as [Types.Point3], // center,
        },
      },
    };

    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      newAnnotation: true,
    };
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  /**
   * Converts a measurement in millimeters into pixels
   * @remarks
   * This function uses the center of the viewport canvas and the camera's viewUp
   * direction to derive a point measurements away from the center but still in
   * the image plane.
   * @param measurement
   * @param viewport
   * @returns
   */
  worldMeasureToCanvas(measurement, viewport) {
    // create two points. the first point (p1) is calculated from the center of
    // the viewport and the second (p2) is "measurement" mm away from p1.
    // Viewport camera's viewUp vector is used to calculate p2 so it is in the
    // same image plane as p1
    const p1 = viewport.canvasToWorld([
      viewport.canvas.width / 2,
      viewport.canvas.height / 2,
    ]);
    const { viewUp } = viewport.getCamera();
    const p2 = vec3.scaleAndAdd(vec3.create(), p1, viewUp, measurement);

    // transform the points from world mm to canvas pixels
    const p1Canvas = viewport.worldToCanvas(p1);
    const p2Canvas = viewport.worldToCanvas(p2);

    // calculate the Euclidian distance between the points in canvas pixels
    const distance = Math.sqrt(
      Math.pow(p2Canvas[0] - p1Canvas[0], 2) +
        Math.pow(p2Canvas[1] - p1Canvas[1], 2)
    );
    return distance;
  }

  /**
   * Returns if the canvas point is near the provided annotation in the provided
   * element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - Annotation
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  isPointNearTool = (
    element: HTMLDivElement,
    annotation: ETDRSGridAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = annotation;
    const { points } = data.handles;

    const center = viewport.worldToCanvas(points[0]);
    const radius = getCanvasCircleRadius([center, canvasCoords]);

    if (Math.abs(radius) < proximity) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: ETDRSGridAnnotation
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
    };

    hideElementCursor(element);

    this._activateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: ETDRSGridAnnotation
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;

    // Find viewports to render on drag.
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
    };
    this._activateModify(element);

    hideElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved } =
      this.editData;
    const { data } = annotation;

    if (newAnnotation && !hasMoved) {
      return;
    }

    // ETDRS Grid tool should reset its highlight to false on mouse up (as opposed
    // to other tools that keep it highlighted until the user moves. The reason
    // is that we use top-left and bottom-right handles to define the circle,
    // and they are by definition not in the circle on mouse up.
    annotation.highlighted = false;
    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);

    resetElementCursor(element);

    const { renderingEngine } = getEnabledElement(element);

    this.editData = null;
    this.isDrawing = false;

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID);
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }
  };

  _dragDrawCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { currentPoints } = eventDetail;
    const currentCanvasPoints = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;
    const { canvasToWorld } = viewport;

    //////
    const { annotation, viewportIdsToRender } = this.editData;
    const { data } = annotation;

    data.handles.points = [
      canvasToWorld(currentCanvasPoints), // center stays
      canvasToWorld(currentCanvasPoints), // end point moves (changing radius)
    ];

    annotation.invalidated = true;

    this.editData.hasMoved = true;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  _dragModifyCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender } = this.editData;
    const { data } = annotation;

    // Moving tool
    const { deltaPoints } = eventDetail;
    const worldPosDelta = deltaPoints.world;

    const points = data.handles.points;

    points.forEach((point) => {
      point[0] += worldPosDelta[0];
      point[1] += worldPosDelta[1];
      point[2] += worldPosDelta[2];
    });
    annotation.invalidated = true;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  _dragHandle = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { canvasToWorld, worldToCanvas } = enabledElement.viewport;

    const { annotation } = this.editData;
    const { data } = annotation;
    const { points } = data.handles;

    const canvasCoordinates = points.map((p) => worldToCanvas(p));

    // Move current point in that direction.
    // Move other points in opposite direction.

    const { currentPoints } = eventDetail;
    const currentCanvasPoints = currentPoints.canvas;

    // Dragging center, move the grid
    const dXCanvas = currentCanvasPoints[0] - canvasCoordinates[0][0];
    const dYCanvas = currentCanvasPoints[1] - canvasCoordinates[0][1];

    const canvasCenter = currentCanvasPoints as Types.Point2;
    const canvasEnd = <Types.Point2>[
      canvasCoordinates[1][0] + dXCanvas,
      canvasCoordinates[1][1] + dYCanvas,
    ];

    points[0] = canvasToWorld(canvasCenter);
    points[1] = canvasToWorld(canvasEnd);
  };

  cancel = (element: HTMLDivElement) => {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false;
      this._deactivateDraw(element);
      this._deactivateModify(element);
      resetElementCursor(element);

      const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
      const { data } = annotation;

      annotation.highlighted = false;
      data.handles.activeHandleIndex = null;

      const { renderingEngine } = getEnabledElement(element);

      triggerAnnotationRenderForViewportIds(
        renderingEngine,
        viewportIdsToRender
      );

      if (newAnnotation) {
        triggerAnnotationCompleted(annotation);
      }

      this.editData = null;
      return annotation.annotationUID;
    }
  };

  _activateModify = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _activateDraw = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragDrawCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._dragDrawCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragDrawCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragDrawCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._dragDrawCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragDrawCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * it is used to draw the ETDRS grid annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return renderStatus;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as ETDRSGridAnnotation;
      const { annotationUID, data } = annotation;
      const { handles } = data;
      const { points } = handles;

      styleSpecifier.annotationUID = annotationUID;

      const { color, lineWidth, lineDash } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      const canvasCoordinates = points.map((p) =>
        viewport.worldToCanvas(p)
      ) as [Types.Point2, Types.Point2];
      const center = canvasCoordinates[0];
      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      // draw cross hair vertical line
      let lineUID = `${annotationUID}-crosshair-vertical`;
      // Define the start and end points of the vertical line (based on center point and crosshair size)
      let start = [center[0], center[1] + CROSSHAIR_SIZE] as Types.Point2;
      let end = [center[0], center[1] - CROSSHAIR_SIZE] as Types.Point2;
      drawLine(svgDrawingHelper, annotationUID, lineUID, start, end, {
        color,
        lineDash,
        lineWidth,
      });
      // draw cross hair horizontal line
      lineUID = `${annotationUID}-crosshair-horizontal`;
      // Define the start and end points of the horizontal line (based on center point and crosshair size)
      start = [center[0] + CROSSHAIR_SIZE, center[1]] as Types.Point2;
      end = [center[0] - CROSSHAIR_SIZE, center[1]] as Types.Point2;
      drawLine(svgDrawingHelper, annotationUID, lineUID, start, end, {
        color,
        lineDash,
        lineWidth,
      });

      // Convert diameters from millimeters to canvas pixels based on the viewport
      const diametersCanvas = this.configuration.diameters.map((diameter) =>
        this.worldMeasureToCanvas(diameter, viewport)
      );

      // draw the circles
      for (let i = 0; i < diametersCanvas.length; i++) {
        const dataId = `${annotationUID}-circle-${i}`;
        const circleUID = `${annotationUID}-circle-${i}`;
        drawCircleSvg(
          svgDrawingHelper,
          annotationUID,
          circleUID,
          center,
          diametersCanvas[i] / 2,
          {
            color,
            lineDash,
            lineWidth,
          },
          dataId
        );
      }

      // convert the angles from degrees to radians
      const degreesRad = (x) => (x * Math.PI) / 180;
      const angleRadians = this.configuration.degrees.map((degree) =>
        degreesRad(degree)
      );

      // Define the lines' start and end points using trigonometry (cos and sin) to calculate x
      // and y coordinates based on each angle [45, 135, 225, 315] (which was already
      // converted to radians by the degreesRad function).
      for (let i = 0; i < angleRadians.length; i++) {
        const lineUID = `${annotationUID}-line-${i}`;
        /* X is given by the cosine, representing the horizontal distance and Y is given by the sine,
         * representing the vertical distance. Both are multiplied by the diameter and divided
         * by 2 because it represents the radius, which helps calculate the exact position of
         * the points in the circumference. The smaller and bigger radius are used because the lines start
         * by the smaller circle's edge and end by the bigger circle's edge.
         * center[0] and center[1] are added to shift the points to the actual center of the circle.
         */
        const start = [
          (Math.cos(angleRadians[i]) * diametersCanvas[0]) / 2 + center[0],
          (Math.sin(angleRadians[i]) * diametersCanvas[0]) / 2 + center[1],
        ] as Types.Point2;
        const end = [
          (Math.cos(angleRadians[i]) * diametersCanvas[2]) / 2 + center[0],
          (Math.sin(angleRadians[i]) * diametersCanvas[2]) / 2 + center[1],
        ] as Types.Point2;

        drawLine(svgDrawingHelper, annotationUID, lineUID, start, end, {
          color,
          lineDash,
          lineWidth,
        });
      }

      renderStatus = true;
    }

    return renderStatus;
  };
}

ETDRSGridTool.toolName = 'ETDRSGrid';
export default ETDRSGridTool;
