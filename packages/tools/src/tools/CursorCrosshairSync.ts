import { AnnotationTool } from './base';

import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../stateManagement/annotation/annotationState';
import { isAnnotationVisible } from '../stateManagement/annotation/annotationVisibility';
import { drawCircle as drawCircleSvg } from '../drawingSvg';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import {
  EventTypes,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  Annotation,
  Annotations,
} from '../types';
import { CursorCrosshairSync } from '../types/ToolSpecificAnnotationTypes';

import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { StyleSpecifier } from '../types/AnnotationStyle';

/**
 * CursorCrosshairSyncTool is a tool that will show your cursors position in all other elements in the toolGroup if they have a matching FrameOfReference relative to its position in world space.
 *
 *
 * Read more in the Docs section of the website.
 */
class CursorCrosshairSyncTool extends AnnotationTool {
  static toolName;
  touchDragCallback: any;
  mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  isDrawing: boolean;
  isHandleOutsideImage = false;
  _mouseOverElement: null | HTMLDivElement = null;

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
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a EllipticalROI Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.MouseMoveEventType
  ): CursorCrosshairSync => {
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
        label: '',
        handles: {
          points: [[...worldPos]] as [Types.Point3],
        },
      },
    };

    addAnnotation(element, annotation);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  isPointNearTool = (): boolean => {
    //not reevant for tool
    return false;
  };

  handleSelectedCallback = (): void => {
    return;
  };

  toolSelectedCallback = (): void => {
    return;
  };

  cancel = (): void => {
    return;
  };

  /**
   * Overwritten mouseMoveCallback since we want to keep track of the current mouse position and redraw on mouseMove
   * @virtual Event handler for Cornerstone MOUSE_MOVE event.
   *
   *
   * @param evt - The normalized mouse event
   * @param filteredAnnotations - The annotations to check for hover interactions
   * @returns True if the annotation needs to be re-drawn by the annotationRenderingEngine.
   */
  mouseMoveCallback = (evt: EventTypes.MouseMoveEventType): boolean => {
    const annotations = getAnnotations(evt.detail.element, this.getToolName());

    this._mouseOverElement = evt.detail.element;

    if (annotations === undefined || annotations.length === 0) {
      this.addNewAnnotation(evt);
      return false;
    }
    const targetAnnotation = annotations[0];
    if (annotations.length > 1) {
      const wrongAnnotations = annotations.slice(1);
      wrongAnnotations.forEach((annotation) => {
        removeAnnotation(annotation.annotationUID, evt.detail.element);
      });
    }
    this.updateAnnotation(targetAnnotation, evt);

    return false;
  };

  filterInteractableAnnotationsForElement(
    element: HTMLDivElement,
    annotations: Annotations
  ): Annotations | undefined {
    return annotations;
  }

  updateAnnotation = (
    annotation: Annotation,
    evt: EventTypes.MouseMoveEventType
  ): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    // Moving tool
    const { currentPoints } = eventDetail;

    data.handles.points = [currentPoints.world];

    annotation.invalidated = true;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  /**
   * Simply draws a circle at the current mouse position
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
    if (element === this._mouseOverElement) {
      return false;
    }
    let annotations = getAnnotations(element, this.getToolName());

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
      const annotation = annotations[i] as CursorCrosshairSync;
      const { annotationUID, data } = annotation;
      const { handles } = data;
      const { points } = handles;

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      const canvasCoordinates = points.map((p) =>
        viewport.worldToCanvas(p)
      ) as [Types.Point2];

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      const ellipseUID = '0';
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        ellipseUID,
        canvasCoordinates[0],
        5,
        {
          color,
          lineDash,
          lineWidth,
        }
      );

      renderStatus = true;
    }

    return renderStatus;
  };
}

CursorCrosshairSyncTool.toolName = 'CursorCrosshairSync';
export default CursorCrosshairSyncTool;
