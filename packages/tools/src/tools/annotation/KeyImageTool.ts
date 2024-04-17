import { Events } from '../../enums';
import { getEnabledElement, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from '../base';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';

import {
  triggerAnnotationCompleted,
  triggerAnnotationModified,
} from '../../stateManagement/annotation/helpers/state';
import { drawArrow as drawArrowSvg } from '../../drawingSvg';
import { state } from '../../store';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';

import { resetElementCursor } from '../../cursors/elementCursor';

import {
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../../types';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import { Annotation } from '../../types';

type Point2 = Types.Point2;

class KeyImageTool extends AnnotationTool {
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
        getTextCallback,
        changeTextCallback,
        canvasPosition: [10, 10],
        canvasSize: 10,
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
  addNewAnnotation = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const annotation = KeyImageTool.createAnnotation({
      metadata: { ...viewport.getViewReference(), referencedImageId },
    });

    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    this.configuration.getTextCallback((text) => {
      if (!text) {
        removeAnnotation(annotation.annotationUID);
        triggerAnnotationRenderForViewportIds(
          renderingEngine,
          viewportIdsToRender
        );
        this.isDrawing = false;
        return;
      }
      annotation.data.text = text;

      triggerAnnotationCompleted(annotation);

      triggerAnnotationRenderForViewportIds(
        renderingEngine,
        viewportIdsToRender
      );
    });

    return annotation;
  };

  public cancel() {
    // No op - the annotation can't be in a partial state
  }

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
    annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { data } = annotation;

    const { canvasPosition, canvasSize } = this.configuration;
    if (!canvasPosition?.length) {
      return false;
    }
    if (
      Math.abs(canvasCoords[0] - canvasPosition[0] + canvasSize / 2) <=
        canvasSize / 2 &&
      Math.abs(canvasCoords[1] - canvasPosition[1] + canvasSize / 2) <=
        canvasSize / 2
    ) {
      return true;
    }
    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: Annotation
  ): void => {
    annotation.highlighted = true;

    evt.preventDefault();
  };

  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    handle: ToolHandle
  ): void {
    // Nothing special to do here.
  }

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    this._deactivateModify(element);
    resetElementCursor(element);
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
        annotation as Annotation,
        eventDetail.currentPoints.canvas,
        6 // Todo: get from configuration
      )
    );

    if (!clickedAnnotation) {
      return;
    }

    const annotation = clickedAnnotation as Annotation;

    this.configuration.changeTextCallback(
      clickedAnnotation,
      evt.detail,
      this._doneChangingTextCallback.bind(this, element, annotation)
    );

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

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    // Dispatching annotation modified
    triggerAnnotationModified(annotation, element);
  }

  _activateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
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
  };

  _deactivateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
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
      const annotation = annotations[i];
      const { annotationUID } = annotation;

      styleSpecifier.annotationUID = annotationUID;

      const { color } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      const { canvasPosition, canvasSize } = this.configuration;
      if (canvasPosition?.length) {
        const arrowUID = '1';
        drawArrowSvg(
          svgDrawingHelper,
          annotationUID,
          arrowUID,
          canvasPosition.map((it) => it + canvasSize) as Point2,
          canvasPosition as Point2,
          {
            color,
            width: 1,
          }
        );
      }

      renderStatus = true;

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }
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

KeyImageTool.toolName = 'KeyImage';

export default KeyImageTool;
