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
import { vec2 } from 'gl-matrix';

import { AnnotationTool } from '../base';
import throttle from '../../utilities/throttle';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import * as lineSegment from '../../utilities/math/line';
import { polyline } from '../../utilities/math';

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
  Annotation,
} from '../../types';
import { LengthAnnotation } from '../../types/ToolSpecificAnnotationTypes';

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
  static toolName: string = 'PlanarFreehandROI';

  public touchDragCallback: any;
  public mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  private drawData?: {
    canvasPoints: number[];
    handleIndex: number;
    annotation: Types.Annotation;
    viewportIdsToRender: string[];
  };
  private editData?: {
    annotation: Types.Annotation;
    viewportIdsToRender: string[];
    handleIndex?: number;
  } | null;
  isDrawing: boolean = false;
  isEditing: boolean = false;

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
      annotation,
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
    annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const points = annotation.data.handles.points;

    // NOTE: It is implemented this way so that we do not double calculate
    // points when number crunching adjacent line segments.
    let previousPoint = viewport.worldToCanvas(points[0]);

    for (let i = 1; i < points.length; i++) {
      const p1 = previousPoint;
      const p2 = viewport.worldToCanvas(points[i]);

      let distance = this.pointCanProjectOnLine(
        canvasCoords,
        p1,
        p2,
        proximity
      );

      if (distance) {
        return true;
      }

      previousPoint = p2;
    }

    // check last point to first point
    const pStart = viewport.worldToCanvas(points[0]);
    const pEnd = viewport.worldToCanvas(points[points.length - 1]);

    let distance = this.pointCanProjectOnLine(
      canvasCoords,
      pStart,
      pEnd,
      proximity
    );

    if (distance) {
      return true;
    }

    return false;
  };

  private pointCanProjectOnLine = (p, p1, p2, proximity) => {
    // Perfom checks in order of computational complexity.
    const p1p = [p[0] - p1[0], p[1] - p1[1]]; // { x: p.x - p1.x, y: p.y - p1.y };
    const p1p2 = [p2[0] - p1[0], p2[1] - p1[1]]; //{ x: p2.x - p1.x, y: p2.y - p1.y };

    const dot = p1p[0] * p1p2[0] + p1p[1] * p1p2[1];

    // const dot = p1p.x * p1p2.x + p1p.y * p1p2.y;

    // Dot product needs to be positive to be a candidate for projection onto line segment.
    if (dot < 0) {
      return false;
    }

    const p1p2Mag = Math.sqrt(p1p2[0] * p1p2[0] + p1p2[1] * p1p2[1]);
    const projectionVectorMag = dot / p1p2Mag;
    const p1p2UnitVector = [p1p2[0] / p1p2Mag, p1p2[1] / p1p2Mag];
    const projectionVector = [
      p1p2UnitVector[0] * projectionVectorMag,
      p1p2UnitVector[1] * projectionVectorMag,
    ];
    const projectionPoint = <Type.Point2>[
      p1[0] + projectionVector[0],
      p1[1] + projectionVector[1],
    ];

    const distance = vec2.distance(p, projectionPoint);

    if (distance > proximity) {
      // point is too far away.
      return false;
    }

    // Check projects onto line segment.
    if (vec2.distance(p1, projectionPoint) > vec2.distance(p1, p2)) {
      return false;
    }

    return distance;
  };

  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: LengthAnnotation,
    interactionType: InteractionTypes
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    this.activateEdit(element);
  };

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

    if (
      lastCanvasPoint[0] === canvasPos[0] &&
      lastCanvasPoint[0] === canvasPos[0]
    ) {
      // Haven't changed point, don't render
      return;
    }

    canvasPoints.push(canvasPos);
    this.drawData.handleIndex = handleIndex + 1;

    this.checkIfCrossedDuringCreate(evt);

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  private checkIfCrossedDuringCreate(evt) {
    const { canvasPoints } = this.drawData;
    const pointsLessLastTwo = canvasPoints.slice(0, -2);

    const secondTolastPoint = canvasPoints[canvasPoints.length - 2];
    const lastPoint = canvasPoints[canvasPoints.length - 1];

    const lineSegment = polyline.getFirstIntersectionWithPolyline(
      pointsLessLastTwo,
      secondTolastPoint,
      lastPoint,
      false
    );

    if (!lineSegment) {
      return;
    }

    debugger;

    this.applyCreateOnCross(evt, lineSegment[1]);
  }

  private applyCreateOnCross = (evt, lineSegment) => {
    // TODO
  };

  private mouseUpDrawCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    // Convert annotation to world coordinates

    const { canvasPoints, annotation, viewportIdsToRender } = this.drawData;

    // TODO -> This is really expensive and won't scale! What should we do here?
    // It would be best if we could get the transformation matrix and then just
    // apply this to the points, but its still 16 multiplications per point.
    const worldPoints = canvasPoints.map((canvasPoint) =>
      viewport.canvasToWorld(canvasPoint)
    );

    annotation.data.handles.points = worldPoints;

    this.isDrawing = false;
    this.drawData = undefined;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    this.deactivateDraw(element);
  };
  // ================================== //

  // ============ Edit loop =========== //
  private mouseDragEditCallback = (
    evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
  ) => {
    console.log('TODO -> Contour editing');
  };

  private mouseUpEditCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    this.deactivateEdit(element);
  };
  // ================================== //

  cancel = (element: HTMLDivElement) => {
    // TODO CANCEL
  };

  private activateEdit = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this.mouseUpEditCallback);
    element.addEventListener(Events.MOUSE_DRAG, this.mouseDragEditCallback);
    element.addEventListener(Events.MOUSE_CLICK, this.mouseUpEditCallback);

    hideElementCursor(element);
  };

  private deactivateEdit = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this.mouseUpEditCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this.mouseDragEditCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this.mouseUpEditCallback);

    resetElementCursor(element);
  };

  private activateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this.mouseUpDrawCallback);
    element.addEventListener(Events.MOUSE_DRAG, this.mouseDragDrawCallback);
    element.addEventListener(Events.MOUSE_CLICK, this.mouseUpDrawCallback);

    hideElementCursor(element);
  };

  private deactivateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this.mouseUpDrawCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this.mouseDragDrawCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this.mouseUpDrawCallback);

    resetElementCursor(element);
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
      ? this.drawData.annotation.annotationUID
      : this.editData.annotation.annotationUID;

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

    const { canvasPoints } = this.drawData;

    const lineWidth = this.getStyle(settings, 'lineWidth', annotation);
    // const lineDash = this.getStyle(settings, 'lineDash', annotation);
    const color = this.getStyle(settings, 'color', annotation);

    const options = {
      color: color === undefined ? undefined : <string>color,
      width: lineWidth === undefined ? undefined : <number>lineWidth,
    };

    const polylineUID = '1';

    drawPolylineSvg(
      svgDrawingHelper,
      PlanarFreehandROITool.toolName,
      annotation.annotationUID,
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
    const { viewport } = enabledElement;

    const settings = Settings.getObjectSettings(
      annotation,
      PlanarFreehandROITool
    );

    // Todo -> Its unfortunate that we have to do this for each annotation,
    // Even if its unchanged. Perhaps we should cache canvas points per element
    // on the tool? That feels very weird also as we'd need to manage it/clean
    // them up.
    const canvasPoints = annotation.data.handles.points.map((worldPos) =>
      viewport.worldToCanvas(worldPos)
    );

    const lineWidth = this.getStyle(settings, 'lineWidth', annotation);
    // const lineDash = this.getStyle(settings, 'lineDash', annotation);
    const color = this.getStyle(settings, 'color', annotation);

    const options = {
      color: color === undefined ? undefined : <string>color,
      width: lineWidth === undefined ? undefined : <number>lineWidth,
      connectLastToFirst: true,
    };

    const polylineUID = '1';

    drawPolylineSvg(
      svgDrawingHelper,
      PlanarFreehandROITool.toolName,
      annotation.annotationUID,
      polylineUID,
      canvasPoints,
      options
    );
  };
}

export default PlanarFreehandROITool;
