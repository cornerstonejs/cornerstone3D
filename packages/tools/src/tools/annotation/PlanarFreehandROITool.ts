import { Events } from '../../enums';
import {
  getEnabledElement,
  cache,
  StackViewport,
  VolumeViewport,
  Settings,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec2, vec3 } from 'gl-matrix';

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
  private commonData?: {
    annotation: Types.Annotation;
    viewportIdsToRender: string[];
    spacing: Types.Point2;
    xDir: Types.Point3;
    yDir: Types.Point3;
  };
  private drawData?: {
    handleIndex: number;
    canvasPoints: Types.Point2[];
  } | null;
  private editData?: {
    annotation: Types.Annotation;
    viewportIdsToRender: string[];
    handleIndex?: number;
    spacing: Types.Point2;
    xDir: Types.Point3;
    yDir: Types.Point3;
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
        allowOpenContours: true,
        closeContourProximity: 10,
        subPixelResolution: 2,
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

    this.activateDraw(evt, annotation, viewportIdsToRender);

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
    const worldPos = currentPoints.world;
    const canvasPos = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;

    const { viewportIdsToRender, xDir, yDir, spacing } = this.commonData;
    const { handleIndex, canvasPoints } = this.drawData;

    const lastCanvasPoint = canvasPoints[canvasPoints.length - 1];
    const lastWorldPoint = viewport.canvasToWorld(lastCanvasPoint);

    const worldPosDiff = vec3.create();

    vec3.subtract(worldPosDiff, worldPos, lastWorldPoint);

    const xDist = Math.abs(vec3.dot(worldPosDiff, xDir));
    const yDist = Math.abs(vec3.dot(worldPosDiff, yDir));

    // Get pixel spacing in the direction.
    // Check that we have moved at least one voxel in each direction.

    if (xDist <= spacing[0] && yDist <= spacing[1]) {
      // Haven't changed world point enough, don't render
      return;
    }

    if (this.checkIfCrossedDuringCreate(evt)) {
      this.applyCreateOnCross(evt);
    } else {
      const numPointsAdded = this.addCanvasPointsToArray(
        evt,
        canvasPoints,
        canvasPos
      );

      this.drawData.handleIndex = handleIndex + numPointsAdded;
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  /**
   * Adds one or more points to the array at a resolution defined by the underlying image.
   */
  private addCanvasPointsToArray = (
    evt,
    canvasPoints,
    newCanvasPoint
  ): number => {
    const { xDir, yDir, spacing } = this.commonData;

    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const lastWorldPos = viewport.canvasToWorld(
      canvasPoints[canvasPoints.length - 1]
    );
    const newWorldPos = viewport.canvasToWorld(newCanvasPoint);

    const worldPosDiff = vec3.create();

    vec3.subtract(worldPosDiff, newWorldPos, lastWorldPos);

    const xDist = Math.abs(vec3.dot(worldPosDiff, xDir));
    const yDist = Math.abs(vec3.dot(worldPosDiff, yDir));

    const numPointsToAdd = Math.max(
      Math.floor(xDist / spacing[0]),
      Math.floor(yDist / spacing[0])
    );

    if (numPointsToAdd > 1) {
      const lastCanvasPoint = canvasPoints[canvasPoints.length - 1];

      const canvasDist = vec2.dist(lastCanvasPoint, newCanvasPoint);

      const canvasDir = vec2.create();

      vec2.subtract(canvasDir, newCanvasPoint, lastCanvasPoint);

      vec2.set(canvasDir, canvasDir[0] / canvasDist, canvasDir[1] / canvasDist);

      const distPerPoint = canvasDist / numPointsToAdd;

      for (let i = 1; i <= numPointsToAdd; i++) {
        canvasPoints.push([
          lastCanvasPoint[0] + distPerPoint * canvasDir[0] * i,
          lastCanvasPoint[1] + distPerPoint * canvasDir[1] * i,
        ]);
      }
    } else {
      canvasPoints.push(newCanvasPoint);
    }

    return numPointsToAdd;
  };

  private getSpacingAndXYDirections = (viewport) => {
    let spacing;
    let xDir;
    let yDir;

    if (viewport instanceof StackViewport) {
      // Check XY directions
      const imageData = viewport.getImageData();

      xDir = imageData.direction.slice(0, 3);
      yDir = imageData.direction.slice(3, 6);

      spacing = imageData.spacing;
    } else {
      // Check volume directions
      // TODO
    }

    const subPixelResolution = this.configuration.subPixelResolution;

    const subPixelSpacing = [
      spacing[0] / subPixelResolution,
      spacing[1] / subPixelResolution,
    ];

    return { spacing: subPixelSpacing, xDir, yDir };
  };

  private checkIfCrossedDuringCreate = (evt): boolean => {
    // Note as we super sample the added points, we need to check the whole last mouse move, not the points
    const eventDetail = evt.detail;
    const { currentPoints, lastPoints } = eventDetail;
    const canvasPos = currentPoints.canvas;
    const lastCanvasPoint = lastPoints.canvas;

    const { canvasPoints } = this.drawData;
    const pointsLessLastOne = canvasPoints.slice(0, -1);

    const lineSegment = polyline.getFirstIntersectionWithPolyline(
      pointsLessLastOne,
      canvasPos,
      lastCanvasPoint,
      false
    );

    return !!lineSegment;
  };

  private applyCreateOnCross = (evt) => {
    // Remove the crossed points
    const { canvasPoints } = this.drawData;

    while (true) {
      canvasPoints.pop();

      const pointsLessLastTwo = canvasPoints.slice(0, -2);
      const secondTolastPoint = canvasPoints[canvasPoints.length - 2];
      const lastPoint = canvasPoints[canvasPoints.length - 1];

      const stillCrosses = !!polyline.getFirstIntersectionWithPolyline(
        pointsLessLastTwo,
        secondTolastPoint,
        lastPoint,
        false
      );

      if (!stillCrosses) {
        break;
      }
    }

    // Complete contour
    this.completeDrawContour(evt);

    // TODO -> Start an edit immediately
  };

  private mouseUpDrawCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const { allowOpenContours } = this.configuration;
    const { canvasPoints } = this.drawData;
    const firstPoint = canvasPoints[0];
    const lastPoint = canvasPoints[canvasPoints.length - 1];

    if (
      allowOpenContours &&
      !this.pointsAreWithinCloseContourProximity(firstPoint, lastPoint)
    ) {
      this.completeDrawOpenContour(evt);
    } else {
      this.completeDrawContour(evt);
    }
  };

  private completeDrawContour = (
    evt:
      | EventTypes.MouseUpEventType
      | EventTypes.MouseClickEventType
      | EventTypes.MouseDragEventType
  ) => {
    this.removeCrossedLinesOnCompleteDraw();
    const { canvasPoints } = this.drawData;
    const { annotation, viewportIdsToRender } = this.commonData;
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    // Convert annotation to world coordinates

    this.addCanvasPointsToArray(evt, canvasPoints, canvasPoints[0]);
    // Remove last point which will be a duplicate now.
    canvasPoints.pop();

    // TODO -> This is really expensive and won't scale! What should we do here?
    // It would be best if we could get the transformation matrix and then just
    // apply this to the points, but its still 16 multiplications per point.
    const worldPoints = canvasPoints.map((canvasPoint) =>
      viewport.canvasToWorld(canvasPoint)
    );

    annotation.data.handles.points = worldPoints;
    annotation.data.isOpenContour = false;

    this.isDrawing = false;
    this.drawData = undefined;
    this.commonData = undefined;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    this.deactivateDraw(element);
  };

  private completeDrawOpenContour = (
    evt:
      | EventTypes.MouseUpEventType
      | EventTypes.MouseClickEventType
      | EventTypes.MouseDragEventType
  ) => {
    const { canvasPoints } = this.drawData;
    const { annotation, viewportIdsToRender } = this.commonData;
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    // TODO -> This is really expensive and won't scale! What should we do here?
    // It would be best if we could get the transformation matrix and then just
    // apply this to the points, but its still 16 multiplications per point.
    const worldPoints = canvasPoints.map((canvasPoint) =>
      viewport.canvasToWorld(canvasPoint)
    );

    annotation.data.handles.points = worldPoints;
    annotation.data.isOpenContour = true;

    this.isDrawing = false;
    this.drawData = undefined;
    this.commonData = undefined;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    this.deactivateDraw(element);
  };

  private removeCrossedLinesOnCompleteDraw = () => {
    const { canvasPoints } = this.drawData;
    const numPoints = canvasPoints.length;

    const endToStart = [canvasPoints[0], canvasPoints[numPoints - 1]];
    const canvasPointsMinusEnds = canvasPoints.slice(0, -1).slice(1);

    const lineSegment = polyline.getFirstIntersectionWithPolyline(
      canvasPointsMinusEnds,
      endToStart[0],
      endToStart[1],
      false
    );

    if (lineSegment) {
      // TODO -> Could check which area is bigger and take that one,
      // then check there are no crosses again (iteratively?)
      const indexToRemoveUpTo = lineSegment[1];

      this.drawData.canvasPoints = canvasPoints.splice(0, indexToRemoveUpTo);
    }
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

  private activateDraw = (
    evt: EventTypes.MouseDownActivateEventType,
    annotation: Types.Annotation,
    viewportIdsToRender: string[]
  ) => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const canvasPos = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { spacing, xDir, yDir } = this.getSpacingAndXYDirections(viewport);

    this.drawData = {
      canvasPoints: [canvasPos],
      handleIndex: 0,
    };

    this.commonData = {
      annotation,
      viewportIdsToRender,
      spacing,
      xDir,
      yDir,
    };

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

    const activeAnnotationUID = this.commonData.annotation.annotationUID;

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
    const { allowOpenContours } = this.configuration;
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

    drawPolylineSvg(
      svgDrawingHelper,
      PlanarFreehandROITool.toolName,
      annotation.annotationUID,
      '1',
      canvasPoints,
      options
    );

    if (allowOpenContours) {
      const firstPoint = canvasPoints[0];
      const lastPoint = canvasPoints[canvasPoints.length - 1];

      // Check if start and end are within close proximity
      if (this.pointsAreWithinCloseContourProximity(firstPoint, lastPoint)) {
        // Preview join last points

        drawPolylineSvg(
          svgDrawingHelper,
          PlanarFreehandROITool.toolName,
          annotation.annotationUID,
          '2',
          [lastPoint, firstPoint],
          options
        );
      } else {
        // Draw start point
        const handleGroupUID = '0';

        drawHandlesSvg(
          svgDrawingHelper,
          PlanarFreehandROITool.toolName,
          annotation.annotationUID,
          handleGroupUID,
          [firstPoint],
          { color, handleRadius: 2 }
        );
      }
    }
  };

  private pointsAreWithinCloseContourProximity(point1, point2): boolean {
    const { closeContourProximity } = this.configuration;

    return vec2.dist(point1, point2) < closeContourProximity;
  }

  private renderContourBeingEdited = (
    enabledElement,
    svgDrawingHelper,
    annotation
  ) => {};

  private renderContour = (enabledElement, svgDrawingHelper, annotation) => {
    if (annotation.data.isOpenContour) {
      this.renderOpenContour(enabledElement, svgDrawingHelper, annotation);
    } else {
      this.renderClosedContour(enabledElement, svgDrawingHelper, annotation);
    }
  };

  private renderClosedContour = (
    enabledElement,
    svgDrawingHelper,
    annotation
  ) => {
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

  private renderOpenContour = (
    enabledElement,
    svgDrawingHelper,
    annotation
  ) => {
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
    const color = this.getStyle(settings, 'color', annotation);

    const options = {
      color: color === undefined ? undefined : <string>color,
      width: lineWidth === undefined ? undefined : <number>lineWidth,
      connectLastToFirst: false,
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

    // Draw start point
    const handleGroupUID = '0';
    const firstPoint = canvasPoints[0];
    const lastPoint = canvasPoints[canvasPoints.length - 1];

    drawHandlesSvg(
      svgDrawingHelper,
      PlanarFreehandROITool.toolName,
      annotation.annotationUID,
      handleGroupUID,
      [firstPoint, lastPoint],
      { color, handleRadius: 2 }
    );
  };
}

export default PlanarFreehandROITool;
