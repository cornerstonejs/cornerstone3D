import { Events } from '../../enums';
import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from '../base';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import * as lineSegment from '../../utilities/math/line';

import {
  drawHandles as drawHandlesSvg,
  drawArrow as drawArrowSvg,
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
import { ArrowAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { StyleSpecifier } from '../../types/AnnotationStyle';

class ArrowAnnotateTool extends AnnotationTool {
  static toolName;

  public touchDragCallback: any;
  public mouseDragCallback: any;
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
        getTextCallback,
        changeTextCallback,
        preventHandleOutsideImage: false,
        arrowFirst: true,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
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
    evt: EventTypes.InteractionEventType
  ): ArrowAnnotation => {
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

    const { arrowFirst } = this.configuration;
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
      },
      data: {
        text: '',
        handles: {
          points: [<Types.Point3>[...worldPos], <Types.Point3>[...worldPos]],
          activeHandleIndex: null,
          arrowFirst,
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
    annotation: ArrowAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { data } = annotation;
    const [point1, point2] = data.handles.points;
    const canvasPoint1 = viewport.worldToCanvas(point1);
    const canvasPoint2 = viewport.worldToCanvas(point2);

    const line = {
      start: {
        x: canvasPoint1[0],
        y: canvasPoint1[1],
      },
      end: {
        x: canvasPoint2[0],
        y: canvasPoint2[1],
      },
    };

    const distanceToPoint = lineSegment.distanceToPoint(
      [line.start.x, line.start.y],
      [line.end.x, line.end.y],
      [canvasCoords[0], canvasCoords[1]]
    );

    if (distanceToPoint <= proximity) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: ArrowAnnotation
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
    evt: EventTypes.InteractionEventType,
    annotation: ArrowAnnotation,
    handle: ToolHandle
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

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
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

    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);
    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { viewportId, renderingEngineId, renderingEngine } = enabledElement;

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID);
    }

    if (newAnnotation) {
      this.configuration.getTextCallback((text) => {
        if (!text) {
          removeAnnotation(annotation.annotationUID);
          triggerAnnotationRenderForViewportIds(
            renderingEngine,
            viewportIdsToRender
          );
          this.editData = null;
          this.isDrawing = false;
          return;
        }
        annotation.data.text = text;

        const eventType = Events.ANNOTATION_COMPLETED;

        const eventDetail: AnnotationCompletedEventDetail = {
          annotation,
        };

        triggerEvent(eventTarget, eventType, eventDetail);

        triggerAnnotationRenderForViewportIds(
          renderingEngine,
          viewportIdsToRender
        );
      });
    } else {
      const eventType = Events.ANNOTATION_MODIFIED;

      const eventDetail: AnnotationModifiedEventDetail = {
        annotation,
        viewportId,
        renderingEngineId,
      };

      triggerEvent(eventTarget, eventType, eventDetail);
    }

    this.editData = null;
    this.isDrawing = false;
  };

  _dragCallback = (evt: EventTypes.InteractionEventType): void => {
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

  touchTapCallback = (evt: EventTypes.TouchTapEventType) => {
    if (evt.detail.taps == 2) {
      this.doubleClickCallback(evt);
    }
  };

  doubleClickCallback = (evt: EventTypes.TouchTapEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    let annotations = getAnnotations(this.getToolName(), element);

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return;
    }

    const clickedAnnotation = annotations.find((annotation) =>
      this.isPointNearTool(
        element,
        annotation as ArrowAnnotation,
        eventDetail.currentPoints.canvas,
        6 // Todo: get from configuration
      )
    );

    if (!clickedAnnotation) {
      return;
    }

    const annotation = clickedAnnotation as ArrowAnnotation;

    this.configuration.changeTextCallback(
      clickedAnnotation,
      evt.detail,
      this._doneChangingTextCallback.bind(this, element, annotation)
    );

    this.editData = null;
    this.isDrawing = false;

    // This double click was handled and the dialogue was displayed.
    // No need for any other listener to handle it too - stopImmediatePropagation
    // helps ensure this primarily so that no other listeners on the target element
    // get called.
    evt.stopImmediatePropagation();
    evt.preventDefault();
  };

  _doneChangingTextCallback(element, annotation, updatedText): void {
    annotation.data.text = updatedText;

    const { renderingEngine, viewportId, renderingEngineId } =
      getEnabledElement(element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    // Dispatching annotation modified
    const eventType = Events.ANNOTATION_MODIFIED;

    triggerEvent(eventTarget, eventType, {
      annotation,
      viewportId,
      renderingEngineId,
    });
  }

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
      return annotation.annotationUID;
    }
  };

  _activateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.addEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
  };

  _deactivateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.removeEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
  };

  _activateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_MOVE,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.addEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
  };

  _deactivateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_MOVE,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.removeEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
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

    let annotations = getAnnotations(this.getToolName(), element);

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

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    // Draw SVG
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as ArrowAnnotation;
      const { annotationUID, data } = annotation;
      const { handles, text } = data;
      const { points, activeHandleIndex } = handles;

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      let activeHandleCanvasCoords;

      if (
        !isAnnotationLocked(annotation) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
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
            lineWidth,
          }
        );
      }

      const arrowUID = '1';
      if (this.configuration.arrowFirst) {
        drawArrowSvg(
          svgDrawingHelper,
          annotationUID,
          arrowUID,
          canvasCoordinates[1],
          canvasCoordinates[0],
          {
            color,
            width: lineWidth,
            lineDash: lineDash,
          }
        );
      } else {
        drawArrowSvg(
          svgDrawingHelper,
          annotationUID,
          arrowUID,
          canvasCoordinates[0],
          canvasCoordinates[1],
          {
            color,
            width: lineWidth,
            lineDash: lineDash,
          }
        );
      }

      renderStatus = true;

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      if (!text) {
        continue;
      }

      const options = this.getLinkedTextBoxStyle(styleSpecifier, annotation);
      if (!options.visibility) {
        data.handles.textBox = {
          hasMoved: false,
          worldPosition: <Types.Point3>[0, 0, 0],
          worldBoundingBox: {
            topLeft: <Types.Point3>[0, 0, 0],
            topRight: <Types.Point3>[0, 0, 0],
            bottomLeft: <Types.Point3>[0, 0, 0],
            bottomRight: <Types.Point3>[0, 0, 0],
          },
        };
        continue;
      }

      // Need to update to sync w/ annotation while unlinked/not moved
      if (!data.handles.textBox.hasMoved) {
        // linked to the point that doesn't have the arrowhead by default
        const canvasTextBoxCoords = canvasCoordinates[1];

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
        [text],
        textBoxPosition,
        canvasCoordinates,
        {},
        options
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

  _isInsideVolume(index1, index2, dimensions) {
    return (
      csUtils.indexWithinDimensions(index1, dimensions) &&
      csUtils.indexWithinDimensions(index2, dimensions)
    );
  }
}

function getTextCallback(doneChangingTextCallback) {
  return doneChangingTextCallback(prompt('Enter your annotation:'));
}

function changeTextCallback(data, eventData, doneChangingTextCallback) {
  return doneChangingTextCallback(prompt('Enter your annotation:'));
}

ArrowAnnotateTool.toolName = 'ArrowAnnotate';
export default ArrowAnnotateTool;
