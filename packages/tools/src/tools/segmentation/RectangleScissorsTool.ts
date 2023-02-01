import { cache, getEnabledElement, StackViewport } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { BaseTool } from '../base';
import {
  PublicToolProps,
  ToolProps,
  EventTypes,
  SVGDrawingHelper,
} from '../../types';
import { fillInsideRectangle } from './strategies/fillRectangle';
import { eraseInsideRectangle } from './strategies/eraseRectangle';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';

import { Events } from '../../enums';
import { drawRect as drawRectSvg } from '../../drawingSvg';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';

import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import {
  config as segmentationConfig,
  segmentLocking,
  segmentIndex as segmentIndexController,
  activeSegmentation,
} from '../../stateManagement/segmentation';

import { getSegmentation } from '../../stateManagement/segmentation/segmentationState';
import { LabelmapSegmentationData } from '../../types/LabelmapTypes';

/**
 * Tool for manipulating segmentation data by drawing a rectangle. It acts on the
 * active Segmentation on the viewport (enabled element) and requires an active
 * segmentation to be already present. By default it will use the activeSegmentIndex
 * for the segmentation to modify. You can use SegmentationModule to set the active
 * segmentation and segmentIndex.
 */
class RectangleScissorsTool extends BaseTool {
  static toolName;
  _throttledCalculateCachedStats: any;
  editData: {
    annotation: any;
    segmentationId: string;
    segmentation: any;
    segmentIndex: number;
    segmentsLocked: number[];
    segmentColor: [number, number, number, number];
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox: boolean;
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
        strategies: {
          FILL_INSIDE: fillInsideRectangle,
          ERASE_INSIDE: eraseInsideRectangle,
        },
        defaultStrategy: 'FILL_INSIDE',
        activeStrategy: 'FILL_INSIDE',
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Based on the current position of the mouse and the enabledElement, it
   * finds the active segmentation info and use it for the current tool.
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  preMouseDownCallback = (evt: EventTypes.InteractionEventType): boolean => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;
    const toolGroupId = this.toolGroupId;

    const activeSegmentationRepresentation =
      activeSegmentation.getActiveSegmentationRepresentation(toolGroupId);
    if (!activeSegmentationRepresentation) {
      throw new Error(
        'No active segmentation detected, create one before using scissors tool'
      );
    }

    const { segmentationRepresentationUID, segmentationId, type } =
      activeSegmentationRepresentation;
    const segmentIndex =
      segmentIndexController.getActiveSegmentIndex(segmentationId);
    const segmentsLocked = segmentLocking.getLockedSegments(segmentationId);

    const segmentColor = segmentationConfig.color.getColorForSegmentIndex(
      toolGroupId,
      segmentationRepresentationUID,
      segmentIndex
    );

    const { representationData } = getSegmentation(segmentationId);

    // Todo: are we going to support contour editing with rectangle scissors?
    const { volumeId } = representationData[type] as LabelmapSegmentationData;
    const segmentation = cache.getVolume(volumeId);

    // Todo: Used for drawing the svg only, we might not need it at all
    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId: '',
        toolName: this.getToolName(),
        segmentColor,
      },
      data: {
        handles: {
          points: [
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
          ],
          activeHandleIndex: null,
        },
      },
    };

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      segmentation,
      segmentIndex,
      segmentsLocked,
      segmentColor,
      segmentationId,
      viewportIdsToRender,
      handleIndex: 3,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    };

    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return true;
  };

  _dragCallback = (evt: EventTypes.InteractionEventType) => {
    this.isDrawing = true;

    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, handleIndex } = this.editData;
    const { data } = annotation;

    // Moving handle.
    const { currentPoints } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { worldToCanvas, canvasToWorld } = enabledElement.viewport;
    const worldPos = currentPoints.world;

    const { points } = data.handles;

    // Move this handle.
    points[handleIndex] = [...worldPos];

    let bottomLeftCanvas;
    let bottomRightCanvas;
    let topLeftCanvas;
    let topRightCanvas;

    let bottomLeftWorld;
    let bottomRightWorld;
    let topLeftWorld;
    let topRightWorld;

    switch (handleIndex) {
      case 0:
      case 3:
        // Moving bottomLeft or topRight

        bottomLeftCanvas = worldToCanvas(points[0]);
        topRightCanvas = worldToCanvas(points[3]);

        bottomRightCanvas = [topRightCanvas[0], bottomLeftCanvas[1]];
        topLeftCanvas = [bottomLeftCanvas[0], topRightCanvas[1]];

        bottomRightWorld = canvasToWorld(bottomRightCanvas);
        topLeftWorld = canvasToWorld(topLeftCanvas);

        points[1] = bottomRightWorld;
        points[2] = topLeftWorld;

        break;
      case 1:
      case 2:
        // Moving bottomRight or topLeft
        bottomRightCanvas = worldToCanvas(points[1]);
        topLeftCanvas = worldToCanvas(points[2]);

        bottomLeftCanvas = <Types.Point2>[
          topLeftCanvas[0],
          bottomRightCanvas[1],
        ];
        topRightCanvas = <Types.Point2>[bottomRightCanvas[0], topLeftCanvas[1]];

        bottomLeftWorld = canvasToWorld(bottomLeftCanvas);
        topRightWorld = canvasToWorld(topRightCanvas);

        points[0] = bottomLeftWorld;
        points[3] = topRightWorld;

        break;
    }
    annotation.invalidated = true;

    this.editData.hasMoved = true;

    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  _endCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const {
      annotation,
      newAnnotation,
      hasMoved,
      segmentation,
      segmentationId,
      segmentIndex,
      segmentsLocked,
    } = this.editData;
    const { data } = annotation;

    if (newAnnotation && !hasMoved) {
      return;
    }

    data.handles.activeHandleIndex = null;

    this._deactivateDraw(element);

    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    this.editData = null;
    this.isDrawing = false;

    if (viewport instanceof StackViewport) {
      throw new Error('Not implemented yet');
    }

    const operationData = {
      points: data.handles.points,
      volume: segmentation,
      segmentationId,
      segmentIndex,
      segmentsLocked,
    };

    this.applyActiveStrategy(enabledElement, operationData);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event propagation.
   */
  _activateDraw = (element) => {
    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragCallback);
  };

  /**
   * it is used to draw the rectangleScissor annotation in each
   * request animation frame. Note that the annotation are disappeared
   * after the segmentation modification.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    if (!this.editData) {
      return renderStatus;
    }

    const { viewport } = enabledElement;
    const { annotation } = this.editData;

    // Todo: rectangle color based on segment index
    const toolMetadata = annotation.metadata;
    const annotationUID = annotation.annotationUID;

    const data = annotation.data;
    const { points } = data.handles;
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));
    const color = `rgb(${toolMetadata.segmentColor.slice(0, 3)})`;

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed');
      return renderStatus;
    }

    const rectangleUID = '0';
    drawRectSvg(
      svgDrawingHelper,
      annotationUID,
      rectangleUID,
      canvasCoordinates[0],
      canvasCoordinates[3],
      {
        color,
      }
    );

    renderStatus = true;

    return renderStatus;
  };
}

RectangleScissorsTool.toolName = 'RectangleScissor';
export default RectangleScissorsTool;
