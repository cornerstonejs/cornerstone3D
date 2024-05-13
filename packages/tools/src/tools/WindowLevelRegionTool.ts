import { AnnotationTool } from './base';

import { getEnabledElement, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../stateManagement';
import { triggerAnnotationCompleted } from '../stateManagement/annotation/helpers/state';
import { drawRect as drawRectSvg } from '../drawingSvg';
import { state } from '../store';
import { Events } from '../enums';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import {
  resetElementCursor,
  hideElementCursor,
} from '../cursors/elementCursor';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';

import {
  EventTypes,
  ToolProps,
  PublicToolProps,
  SVGDrawingHelper,
} from '../types';
import { RectangleROIAnnotation } from '../types/ToolSpecificAnnotationTypes';
import { StyleSpecifier } from '../types/AnnotationStyle';

import { windowLevel } from '../utilities/voi';

import { clip } from '../utilities';

/**
 * WindowLevelRegion tool manipulates the windowLevel applied to a viewport. It
 * provides a way to set the windowCenter and windowWidth of a viewport
 * by dragging mouse over the image to draw a rectangle region which is used to calculate
 * the windowCenter and windowWidth based on the ROI
 *
 */

class WindowLevelRegionTool extends AnnotationTool {
  static toolName;

  editData: {
    annotation: any;
    viewportIdsToRender: string[];
  } | null;
  isDrawing: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        // The minimum window width to be applied to the viewport regardless of the calculated value
        minWindowWidth: 10,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a RectangleROI Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (evt: EventTypes.InteractionEventType): any => {
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
      invalidated: true,
      highlighted: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
      },
      data: {
        handles: {
          points: [
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
          ],
        },
        cachedStats: {},
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
    };
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender } = this.editData;

    this._deactivateDraw(element);

    resetElementCursor(element);

    const { renderingEngine } = getEnabledElement(element);

    this.editData = null;
    this.isDrawing = false;

    removeAnnotation(annotation.annotationUID);

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    triggerAnnotationCompleted(annotation);

    this.applyWindowLevelRegion(annotation, element);
  };

  _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;

    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender } = this.editData;
    const { data } = annotation;
    const { currentPoints } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { worldToCanvas, canvasToWorld } = enabledElement.viewport;
    const worldPos = currentPoints.world;

    const { points } = data.handles;
    const DEFAULT_HANDLE_INDEX = 3;
    points[DEFAULT_HANDLE_INDEX] = [...worldPos];

    const bottomLeftCanvas = worldToCanvas(points[0]);
    const topRightCanvas = worldToCanvas(points[3]);

    const bottomRightCanvas = <Types.Point2>[
      topRightCanvas[0],
      bottomLeftCanvas[1],
    ];
    const topLeftCanvas = <Types.Point2>[
      bottomLeftCanvas[0],
      topRightCanvas[1],
    ];

    const bottomRightWorld = canvasToWorld(bottomRightCanvas);
    const topLeftWorld = canvasToWorld(topLeftCanvas);

    points[1] = bottomRightWorld;
    points[2] = topLeftWorld;

    annotation.invalidated = true;

    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateDraw = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._dragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._dragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * it is used to draw the rectangleROI annotation in each
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
      const annotation = annotations[i] as RectangleROIAnnotation;
      const { annotationUID, data } = annotation;
      const { points } = data.handles;

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      styleSpecifier.annotationUID = annotationUID;

      const { color, lineWidth, lineDash } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      const dataId = `${annotationUID}-rect`;
      const rectangleUID = '0';
      drawRectSvg(
        svgDrawingHelper,
        annotationUID,
        rectangleUID,
        canvasCoordinates[0],
        canvasCoordinates[3],
        {
          color,
          lineDash,
          lineWidth,
        },
        dataId
      );

      renderStatus = true;
    }

    return renderStatus;
  };

  applyWindowLevelRegion = (annotation, element): void => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const imageData = windowLevel.extractWindowLevelRegionToolData(viewport);
    const { data } = annotation;
    const { points } = data.handles;

    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));
    const startCanvas = canvasCoordinates[0];
    const endCanvas = canvasCoordinates[3];

    let left = Math.min(startCanvas[0], endCanvas[0]);
    let top = Math.min(startCanvas[1], endCanvas[1]);
    let width = Math.abs(startCanvas[0] - endCanvas[0]);
    let height = Math.abs(startCanvas[1] - endCanvas[1]);

    left = clip(left, 0, imageData.width);
    top = clip(top, 0, imageData.height);
    width = Math.floor(Math.min(width, Math.abs(imageData.width - left)));
    height = Math.floor(Math.min(height, Math.abs(imageData.height - top)));

    // Get the pixel data in the rectangular region
    const pixelLuminanceData = windowLevel.getLuminanceFromRegion(
      imageData,
      Math.round(left),
      Math.round(top),
      width,
      height
    );

    // Calculate the minimum and maximum pixel values
    const minMaxMean = windowLevel.calculateMinMaxMean(
      pixelLuminanceData,
      imageData.minPixelValue,
      imageData.maxPixelValue
    );

    // Adjust the viewport window width and center based on the calculated values
    if (this.configuration.minWindowWidth === undefined) {
      this.configuration.minWindowWidth = 10;
    }

    const windowWidth = Math.max(
      Math.abs(minMaxMean.max - minMaxMean.min),
      this.configuration.minWindowWidth
    );
    const windowCenter = minMaxMean.mean;

    const voiRange = utilities.windowLevel.toLowHighRange(
      windowWidth,
      windowCenter
    );

    viewport.setProperties({ voiRange });
    viewport.render();
  };

  cancel = (): void => {
    return null;
  };

  isPointNearTool = () => {
    return null;
  };

  toolSelectedCallback = (): void => {
    return null;
  };

  handleSelectedCallback = (): void => {
    return null;
  };

  _activateModify = (): void => {
    return null;
  };

  _deactivateModify = (): void => {
    return null;
  };
}

WindowLevelRegionTool.toolName = 'WindowLevelRegion';
export default WindowLevelRegionTool;
