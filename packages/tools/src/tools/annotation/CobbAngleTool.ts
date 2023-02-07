import { Events } from '../../enums';
import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from '../base';
import throttle from '../../utilities/throttle';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import * as lineSegment from '../../utilities/math/line';
import angleBetweenLines from '../../utilities/math/angle/angleBetweenLines';
import { midPoint2 } from '../../utilities/math/midPoint';

import {
  drawHandles as drawHandlesSvg,
  drawLine as drawLineSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg';
import { state } from '../../store';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import {
  AnnotationCompletedEventDetail,
  AnnotationModifiedEventDetail,
} from '../../types/EventTypes';

import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';

import {
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  PublicToolProps,
  ToolProps,
  InteractionTypes,
  SVGDrawingHelper,
} from '../../types';
import { AngleAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { StyleSpecifier } from '../../types/AnnotationStyle';

class CobbAngleTool extends AnnotationTool {
  static toolName;

  public touchDragCallback: any;
  public mouseDragCallback: any;
  angleStartedNotYetCompleted: boolean;
  _throttledCalculateCachedStats: any;
  editData: {
    annotation: any;
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox?: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    );
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Length Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.MouseDownActivateEventType
  ): AngleAnnotation => {
    if (this.angleStartedNotYetCompleted) {
      return;
    }

    this.angleStartedNotYetCompleted = true;
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    hideElementCursor(element);
    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
      },
      data: {
        handles: {
          points: [<Types.Point3>[...worldPos], <Types.Point3>[...worldPos]],
          activeHandleIndex: null,
          textBox: {
            hasMoved: false,
            worldPosition: <Types.Point3>[0, 0, 0],
            worldBoundingBox: {
              topLeft: <Types.Point3>[0, 0, 0],
              topRight: <Types.Point3>[0, 0, 0],
              bottomLeft: <Types.Point3>[0, 0, 0],
              bottomRight: <Types.Point3>[0, 0, 0],
            },
          },
        },
        label: '',
        cachedStats: {},
      },
    };

    addAnnotation(element, annotation);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex: 1,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    };
    this._activateDraw(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  /**
   * It returns if the canvas point is near the provided length annotation in the provided
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
    annotation: AngleAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { data } = annotation;
    const [point1, point2, point3, point4] = data.handles.points;
    const canvasPoint1 = viewport.worldToCanvas(point1);
    const canvasPoint2 = viewport.worldToCanvas(point2);
    const canvasPoint3 = viewport.worldToCanvas(point3);
    const canvasPoint4 = viewport.worldToCanvas(point4);

    const line1 = {
      start: {
        x: canvasPoint1[0],
        y: canvasPoint1[1],
      },
      end: {
        x: canvasPoint2[0],
        y: canvasPoint2[1],
      },
    };

    const line2 = {
      start: {
        x: canvasPoint3[0],
        y: canvasPoint3[1],
      },
      end: {
        x: canvasPoint4[0],
        y: canvasPoint4[1],
      },
    };

    const distanceToPoint = lineSegment.distanceToPoint(
      [line1.start.x, line1.start.y],
      [line1.end.x, line1.end.y],
      [canvasCoords[0], canvasCoords[1]]
    );

    const distanceToPoint2 = lineSegment.distanceToPoint(
      [line2.start.x, line2.start.y],
      [line2.end.x, line2.end.y],
      [canvasCoords[0], canvasCoords[1]]
    );

    if (distanceToPoint <= proximity || distanceToPoint2 <= proximity) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: AngleAnnotation,
    interactionType: InteractionTypes
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
      movingTextBox: false,
    };

    this._activateModify(element);

    hideElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback(
    evt: EventTypes.MouseDownEventType,
    annotation: AngleAnnotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    let movingTextBox = false;
    let handleIndex;

    if ((handle as TextBoxHandle).worldPosition) {
      movingTextBox = true;
    } else {
      handleIndex = data.handles.points.findIndex((p) => p === handle);
    }

    // Find viewports to render on drag.
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex,
      movingTextBox,
    };
    this._activateModify(element);

    hideElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  }

  _mouseUpCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved } =
      this.editData;

    const { data } = annotation;
    if (newAnnotation && !hasMoved) {
      // when user starts the drawing by click, and moving the mouse, instead
      // of click and drag
      return;
    }

    // If preventing new measurement means we are in the middle of an existing measurement
    // we shouldn't deactivate modify or draw
    if (this.angleStartedNotYetCompleted && data.handles.points.length < 4) {
      resetElementCursor(element);

      // adds the first point of the second line
      this.editData.handleIndex = data.handles.points.length;
      return;
    }

    this.angleStartedNotYetCompleted = false;
    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);
    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID, element);
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (newAnnotation) {
      const eventType = Events.ANNOTATION_COMPLETED;

      const eventDetail: AnnotationCompletedEventDetail = {
        annotation,
      };

      triggerEvent(eventTarget, eventType, eventDetail);
    }

    this.editData = null;
    this.isDrawing = false;
  };

  _mouseDragCallback = (
    evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
  ) => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, handleIndex, movingTextBox } =
      this.editData;
    const { data } = annotation;

    if (movingTextBox) {
      // Drag mode - moving text box
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
      // Drag mode - moving handle
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const points = data.handles.points;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
      annotation.invalidated = true;
    } else {
      // Move mode - after double click, and mouse move to draw
      const { currentPoints } = eventDetail;
      const worldPos = currentPoints.world;

      data.handles.points[handleIndex] = [...worldPos];
      annotation.invalidated = true;
    }

    this.editData.hasMoved = true;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
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

      const enabledElement = getEnabledElement(element);
      const { renderingEngine } = enabledElement;

      triggerAnnotationRenderForViewportIds(
        renderingEngine,
        viewportIdsToRender
      );

      if (newAnnotation) {
        const eventType = Events.ANNOTATION_COMPLETED;

        const eventDetail: AnnotationCompletedEventDetail = {
          annotation,
        };

        triggerEvent(eventTarget, eventType, eventDetail);
      }

      this.editData = null;
      this.angleStartedNotYetCompleted = false;
      return annotation.annotationUID;
    }
  };

  _activateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._mouseUpCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._mouseUpCallback as EventListener
    );

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  };

  _deactivateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._mouseUpCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._mouseUpCallback as EventListener
    );

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  };

  _activateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._mouseUpCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_MOVE,
      this._mouseDragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._mouseUpCallback as EventListener
    );

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  };

  _deactivateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._mouseUpCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_MOVE,
      this._mouseDragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._mouseUpCallback as EventListener
    );

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  };

  /**
   * it is used to draw the length annotation in each
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

    let annotations = getAnnotations(element, this.getToolName());

    // Todo: We don't need this anymore, filtering happens in triggerAnnotationRender
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

    const targetId = this.getTargetId(viewport);
    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    // Draw SVG
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as AngleAnnotation;
      const { annotationUID, data } = annotation;
      const { points, activeHandleIndex } = data.handles;

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      // WE HAVE TO CACHE STATS BEFORE FETCHING TEXT
      if (!data.cachedStats[targetId]) {
        data.cachedStats[targetId] = {
          angle: null,
        };

        this._calculateCachedStats(annotation, renderingEngine, enabledElement);
      } else if (annotation.invalidated) {
        this._throttledCalculateCachedStats(
          annotation,
          renderingEngine,
          enabledElement
        );
      }

      let activeHandleCanvasCoords;

      if (
        !isAnnotationLocked(annotation) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      if (activeHandleCanvasCoords) {
        const handleGroupUID = '0';

        drawHandlesSvg(
          svgDrawingHelper,
          annotationUID,
          handleGroupUID,
          canvasCoordinates,
          {
            color,
            lineDash,
            lineWidth,
          }
        );
      }

      let lineUID = '1';
      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        lineUID,
        canvasCoordinates[0],
        canvasCoordinates[1],
        {
          color,
          width: lineWidth,
          lineDash,
        }
      );

      renderStatus = true;

      // Don't add textBox until annotation has 4 anchor points
      if (canvasCoordinates.length < 4) {
        return renderStatus;
      }

      lineUID = '2';

      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        lineUID,
        canvasCoordinates[2],
        canvasCoordinates[3],
        {
          color,
          width: lineWidth,
          lineDash,
        }
      );

      lineUID = '3';
      const mid1 = midPoint2(canvasCoordinates[0], canvasCoordinates[1]);
      const mid2 = midPoint2(canvasCoordinates[2], canvasCoordinates[3]);
      drawLineSvg(svgDrawingHelper, annotationUID, lineUID, mid1, mid2, {
        color,
        lineWidth: '1',
        lineDash: '1,4',
      });

      if (!data.cachedStats[targetId]?.angle) {
        continue;
      }

      const textLines = this._getTextLines(data, targetId);

      if (!data.handles.textBox.hasMoved) {
        const canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates);

        data.handles.textBox.worldPosition =
          viewport.canvasToWorld(canvasTextBoxCoords);
      }

      const textBoxPosition = viewport.worldToCanvas(
        data.handles.textBox.worldPosition
      );

      const textBoxUID = '1';
      const boundingBox = drawLinkedTextBoxSvg(
        svgDrawingHelper,
        annotationUID,
        textBoxUID,
        textLines,
        textBoxPosition,
        canvasCoordinates,
        {},
        this.getLinkedTextBoxStyle(styleSpecifier, annotation)
      );

      const { x: left, y: top, width, height } = boundingBox;

      data.handles.textBox.worldBoundingBox = {
        topLeft: viewport.canvasToWorld([left, top]),
        topRight: viewport.canvasToWorld([left + width, top]),
        bottomLeft: viewport.canvasToWorld([left, top + height]),
        bottomRight: viewport.canvasToWorld([left + width, top + height]),
      };
    }

    return renderStatus;
  };

  // text line for the current active angle annotation
  _getTextLines(data, targetId) {
    const cachedVolumeStats = data.cachedStats[targetId];
    const { angle } = cachedVolumeStats;

    if (angle === undefined) {
      return;
    }

    const textLines = [`${angle.toFixed(2)} ${String.fromCharCode(176)}`];

    return textLines;
  }

  _calculateCachedStats(annotation, renderingEngine, enabledElement) {
    const data = annotation.data;
    const { viewportId, renderingEngineId } = enabledElement;

    // Until we have all four anchors bail out
    if (data.handles.points.length !== 4) {
      return;
    }

    const worldPos1 = data.handles.points[0];
    const worldPos2 = data.handles.points[1];
    const worldPos3 = data.handles.points[2];
    const worldPos4 = data.handles.points[3];

    const { cachedStats } = data;
    const targetIds = Object.keys(cachedStats);

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];
      const angle = angleBetweenLines(
        [worldPos1, worldPos2],
        [worldPos3, worldPos4]
      );

      cachedStats[targetId] = {
        angle,
      };
    }

    annotation.invalidated = false;

    // Dispatching annotation modified
    const eventType = Events.ANNOTATION_MODIFIED;

    const eventDetail: AnnotationModifiedEventDetail = {
      annotation,
      viewportId,
      renderingEngineId,
    };
    triggerEvent(eventTarget, eventType, eventDetail);

    return cachedStats;
  }
}

CobbAngleTool.toolName = 'CobbAngle';
export default CobbAngleTool;
