import { Events } from '../../enums';
import {
  getEnabledElement,
  cache,
  StackViewport,
  Settings,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
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

import {
  drawHandles as drawHandlesSvg,
  drawPolyline as drawPolylineSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg';
import { state } from '../../store';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import { AnnotationModifiedEventDetail } from '../../types/EventTypes';

import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';

import {
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  InteractionTypes,
} from '../../types';
import { LengthAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { annotation } from '@cornerstonejs/tools';

const { transformWorldToIndex } = csUtils;

/**
 * PlanarFreehandROITool lets you draw annotations that measures the area of a arbitrarily drawn region.
 * You can use the PlanarFreehandROITool in all perpendicular views (axial, sagittal, coronal).
 *
 * The resulting annotation's data (statistics) and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * ```js
 * cornerstoneTools.addTool(PlanarFreehandROITool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(PlanarFreehandROITool.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolActive(PlanarFreehandROITool.toolName, {
 *   bindings: [
 *    {
 *       mouseButton: MouseBindings.Primary, // Left Click
 *     },
 *   ],
 * })
 * ```
 *
 * Read more in the Docs section of the website.

 */

class PlanarFreehandROITool extends AnnotationTool {
  static toolName = 'PlanarFreehandROI';

  public touchDragCallback: any;
  public mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  private drawData?: {
    canvasPoints: number[];
    handleIndex: number;
    annotationUID: string;
    viewportIdsToRender: string[];
  };
  private editData?: {
    annotationUID: string;
    viewportIdsToRender: string[];
    handleIndex?: number;
  } | null;
  isDrawing: boolean;
  isEditing: boolean;

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

    // TODO -> When we add stats
    // this._throttledCalculateCachedStats = throttle(
    //   this._calculateCachedStats,
    //   100,
    //   { trailing: true }
    // );
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
  ): LengthAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const canvasPos = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    hideElementCursor(element);
    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    let referencedImageId;
    if (viewport instanceof StackViewport) {
      referencedImageId =
        viewport.getCurrentImageId && viewport.getCurrentImageId();
    } else {
      const volumeId = this.getTargetId(viewport);
      const imageVolume = cache.getVolume(volumeId);
      referencedImageId = csUtils.getClosestImageId(
        imageVolume,
        worldPos,
        viewPlaneNormal,
        viewUp
      );
    }

    if (referencedImageId) {
      const colonIndex = referencedImageId.indexOf(':');
      referencedImageId = referencedImageId.substring(colonIndex + 1);
    }

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      PlanarFreehandROITool.toolName
    );

    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: PlanarFreehandROITool.toolName,
      },
      data: {
        handles: {
          points: [<Types.Point3>[...worldPos]],
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
    // Ensure settings are initialized after annotation instantiation
    Settings.getObjectSettings(annotation, PlanarFreehandROITool);
    addAnnotation(element, annotation);

    this.drawData = {
      canvasPoints: [canvasPos],
      handleIndex: 0,
      // @ts-ignore
      annotationUID: annotation.annotationUID, // This UID will be set on addAnnotation
      viewportIdsToRender,
    };
    this.activateDraw(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  getHandleNearImagePoint(
    element: HTMLDivElement,
    annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
    // We do not want handle selection for this tool
    return false;
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
    annotation: LengthAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    // TODO -> Need to see if point is near the tool so we can begin the edit loop.

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: LengthAnnotation,
    interactionType: InteractionTypes
  ): void => {
    // TODO -> use this or handle selected callback to start edits.
    // I think tool is better actually.
  };

  handleSelectedCallback(
    evt: EventTypes.MouseDownEventType,
    annotation: LengthAnnotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void {
    debugger;
    // TODO -> Not sure if we need this or it should always just be tool selected
  }

  // ========== Drawing loop ========== //
  private mouseDragDrawCallback = (
    evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
  ) => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const canvasPos = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    const { canvasPoints, handleIndex, viewportIdsToRender } = this.drawData;

    const lastCanvasPoint = canvasPoints[handleIndex];

    // TODO -> Maybe should check its a different voxel?
    if (
      lastCanvasPoint[0] === canvasPos[0] &&
      lastCanvasPoint[0] === canvasPos[0]
    ) {
      // Haven't changed point, don't render
      return;
    }

    canvasPoints.push(canvasPos);
    this.drawData.handleIndex = handleIndex + 1;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  private mouseUpDrawCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    // TODO: Update annotation here. This is to stop us from constantly reworking out world positions for hundreds/thousands of points.
  };
  // ================================== //

  // ============ Edit loop =========== //
  private mouseDragEditCallback = (
    evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
  ) => {};

  private mouseUpEditCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {};
  // ================================== //

  cancel = (element: HTMLDivElement) => {
    // TODO CANCEL
  };

  private activateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this.mouseUpEditCallback);
    element.addEventListener(Events.MOUSE_DRAG, this.mouseDragEditCallback);
    element.addEventListener(Events.MOUSE_CLICK, this.mouseUpEditCallback);
  };

  private deactivateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this.mouseUpEditCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this.mouseDragEditCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this.mouseUpEditCallback);
  };

  private activateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this.mouseUpDrawCallback);
    element.addEventListener(Events.MOUSE_DRAG, this.mouseDragDrawCallback);
    element.addEventListener(Events.MOUSE_CLICK, this.mouseUpDrawCallback);
  };

  private deactivateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this.mouseUpDrawCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this.mouseDragDrawCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this.mouseUpDrawCallback);
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
    svgDrawingHelper: any
  ): void => {
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(element, PlanarFreehandROITool.toolName);

    // Todo: We don't need this anymore, filtering happens in triggerAnnotationRender
    if (!annotations?.length) {
      return;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return;
    }

    const isDrawing = this.isDrawing;
    const isEditing = this.isEditing;

    if (!(isDrawing || isEditing)) {
      annotations.forEach((annotation) =>
        this.renderContour(enabledElement, svgDrawingHelper, annotation)
      );

      return;
    }

    const activeAnnotationUID = isDrawing
      ? this.drawData.annotationUID
      : this.editData.annotationUID;

    annotations.forEach((annotation) => {
      if (annotation.annotationUID === activeAnnotationUID) {
        if (isDrawing) {
          this.renderContourBeingDrawn(
            enabledElement,
            svgDrawingHelper,
            annotation
          );
        } else {
          this.renderContourBeingEdited(
            enabledElement,
            svgDrawingHelper,
            annotation
          );
        }
      } else {
        this.renderContour(enabledElement, svgDrawingHelper, annotation);
      }
    });
  };

  private renderContourBeingDrawn = (
    enabledElement,
    svgDrawingHelper,
    annotation
  ) => {
    // const { viewport } = enabledElement;
    // const { element } = viewport;
    // const targetId = this.getTargetId(viewport);
    // const renderingEngine = viewport.getRenderingEngine();
    const settings = Settings.getObjectSettings(
      annotation,
      PlanarFreehandROITool
    );

    const { annotationUID, canvasPoints } = this.drawData;

    const lineWidth = this.getStyle(settings, 'lineWidth', annotation);
    // const lineDash = this.getStyle(settings, 'lineDash', annotation);
    const color = this.getStyle(settings, 'color', annotation);

    const options = {
      color: color === undefined ? undefined : <string>color,
      width: lineWidth === undefined ? undefined : <number>lineWidth,
    };

    // TODO

    const polylineUID = '1';

    drawPolylineSvg(
      svgDrawingHelper,
      PlanarFreehandROITool.toolName,
      annotationUID,
      polylineUID,
      canvasPoints,
      options
    );
  };

  private renderContourBeingEdited = (
    enabledElement,
    svgDrawingHelper,
    annotation
  ) => {};

  private renderContour = (enabledElement, svgDrawingHelper, annotation) => {
    // TODO -> Render contours not being drawn or edited.
  };
}

export default PlanarFreehandROITool;
