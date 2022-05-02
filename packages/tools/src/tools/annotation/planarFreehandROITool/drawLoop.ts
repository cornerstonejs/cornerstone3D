import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';
import { Events } from '../../../enums';
import { EventTypes } from '../../../types';
import { state } from '../../../store';
import { vec3 } from 'gl-matrix';
import triggerAnnotationRenderForViewportIds from '../../../utilities/triggerAnnotationRenderForViewportIds';
import { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import { polyline } from '../../../utilities/math';

const {
  addCanvasPointsToArray,
  pointsAreWithinCloseContourProximity,
  getFirstIntersectionWithPolyline,
  getSpacingAndXYDirections,
} = polyline;

/**
 * Activates the contour drawing event loop.
 */
function activateDraw(
  evt: EventTypes.MouseDownActivateEventType,
  annotation: PlanarFreehandROIAnnotation,
  viewportIdsToRender: string[]
): void {
  this.isDrawing = true;

  const eventDetail = evt.detail;
  const { currentPoints, element } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const { spacing, xDir, yDir } = getSpacingAndXYDirections(
    viewport,
    this.configuration.subPixelResolution
  );

  this.drawData = {
    canvasPoints: [canvasPos],
    polylineIndex: 0,
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
}
/**
 * Dectivates and cleans up the contour drawing event loop.
 */
function deactivateDraw(element: HTMLDivElement): void {
  state.isInteractingWithTool = false;

  element.removeEventListener(Events.MOUSE_UP, this.mouseUpDrawCallback);
  element.removeEventListener(Events.MOUSE_DRAG, this.mouseDragDrawCallback);
  element.removeEventListener(Events.MOUSE_CLICK, this.mouseUpDrawCallback);

  resetElementCursor(element);
}

/**
 * Adds points to a set of preview canvas points of the contour being created.
 * Checks if crossing of lines means early completion and editing needs to be started.
 */
function mouseDragDrawCallback(
  evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
): void {
  const eventDetail = evt.detail;
  const { currentPoints, element } = eventDetail;
  const worldPos = currentPoints.world;
  const canvasPos = currentPoints.canvas;
  const enabledElement = getEnabledElement(element);
  const { renderingEngine, viewport } = enabledElement;

  const { viewportIdsToRender, xDir, yDir, spacing } = this.commonData;
  const { polylineIndex, canvasPoints } = this.drawData;

  const lastCanvasPoint = canvasPoints[canvasPoints.length - 1];
  const lastWorldPoint = viewport.canvasToWorld(lastCanvasPoint);

  const worldPosDiff = vec3.create();

  vec3.subtract(worldPosDiff, worldPos, lastWorldPoint);

  const xDist = Math.abs(vec3.dot(worldPosDiff, xDir));
  const yDist = Math.abs(vec3.dot(worldPosDiff, yDir));

  // Check that we have moved at least one voxel in each direction.
  if (xDist <= spacing[0] && yDist <= spacing[1]) {
    // Haven't changed world point enough, don't render
    return;
  }

  const crossingIndex = this.findCrossingIndexDuringCreate(evt);

  if (crossingIndex !== undefined) {
    // If we have crossed our drawing line, create a closed contour and then
    // start an edit.
    this.applyCreateOnCross(evt, crossingIndex);
  } else {
    const numPointsAdded = addCanvasPointsToArray(
      element,
      canvasPoints,
      canvasPos,
      this.commonData
    );

    this.drawData.polylineIndex = polylineIndex + numPointsAdded;
  }

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

/**
 * Completes the contour on mouse up. If the `allowOpenContours` configuration
 * option is `true`, checks if we should create an open or closed contour.
 * If the `allowOpenContours` configuration option is `false`, always creates a
 * closed contour.
 */
function mouseUpDrawCallback(
  evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
): void {
  const { allowOpenContours } = this.configuration;
  const { canvasPoints } = this.drawData;
  const firstPoint = canvasPoints[0];
  const lastPoint = canvasPoints[canvasPoints.length - 1];

  if (
    allowOpenContours &&
    !pointsAreWithinCloseContourProximity(
      firstPoint,
      lastPoint,
      this.configuration.closeContourProximity
    )
  ) {
    this.completeDrawOpenContour(evt);
  } else {
    this.completeDrawClosedContour(evt);
  }
}

/**
 * Completes the contour being drawn, creating a closed contour annotation.
 */
function completeDrawClosedContour(
  evt:
    | EventTypes.MouseUpEventType
    | EventTypes.MouseClickEventType
    | EventTypes.MouseDragEventType
): void {
  this.removeCrossedLinesOnCompleteDraw();
  const { canvasPoints } = this.drawData;
  const { annotation, viewportIdsToRender } = this.commonData;
  const eventDetail = evt.detail;
  const { element } = eventDetail;
  const enabledElement = getEnabledElement(element);
  const { viewport, renderingEngine } = enabledElement;

  // Convert annotation to world coordinates
  addCanvasPointsToArray(
    element,
    canvasPoints,
    canvasPoints[0],
    this.commonData
  );
  // Remove last point which will be a duplicate now.
  canvasPoints.pop();

  // Note: -> This is pretty expensive and may not scale well with hundreds of
  // contours. A future optimisation if we use this for segmentation is to re-do
  // this rendering with the GPU rather than SVG.
  const worldPoints = canvasPoints.map((canvasPoint) =>
    viewport.canvasToWorld(canvasPoint)
  );

  annotation.data.polyline = worldPoints;
  annotation.data.isOpenContour = false;

  this.triggerAnnotationCompleted(annotation);

  this.isDrawing = false;
  this.drawData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateDraw(element);
}

/**
 * If lines are crossed during the draw loop, remove the points drawn over the
 * crossing.
 */
function removeCrossedLinesOnCompleteDraw(): void {
  const { canvasPoints } = this.drawData;
  const numPoints = canvasPoints.length;

  const endToStart = [canvasPoints[0], canvasPoints[numPoints - 1]];
  const canvasPointsMinusEnds = canvasPoints.slice(0, -1).slice(1);

  const lineSegment = getFirstIntersectionWithPolyline(
    canvasPointsMinusEnds,
    endToStart[0],
    endToStart[1],
    false
  );

  if (lineSegment) {
    const indexToRemoveUpTo = lineSegment[1];

    this.drawData.canvasPoints = canvasPoints.splice(0, indexToRemoveUpTo);
  }
}

/**
 * Completes the contour being drawn, creating an open contour annotation.
 */
function completeDrawOpenContour(
  evt:
    | EventTypes.MouseUpEventType
    | EventTypes.MouseClickEventType
    | EventTypes.MouseDragEventType
): void {
  const { canvasPoints } = this.drawData;
  const { annotation, viewportIdsToRender } = this.commonData;
  const eventDetail = evt.detail;
  const { element } = eventDetail;
  const enabledElement = getEnabledElement(element);
  const { viewport, renderingEngine } = enabledElement;

  // Note: -> This is pretty expensive and may not scale well with hundreds of
  // contours. A future optimisation if we use this for segmentation is to re-do
  // this rendering with the GPU rather than SVG.
  const worldPoints = canvasPoints.map((canvasPoint) =>
    viewport.canvasToWorld(canvasPoint)
  );

  annotation.data.polyline = worldPoints;
  annotation.data.isOpenContour = true;

  // Add the first and last points to the list of handles. These means they
  // will render handles on mouse hover.
  annotation.data.handles.points = [
    worldPoints[0],
    worldPoints[worldPoints.length - 1],
  ];

  this.triggerAnnotationCompleted(annotation);

  this.isDrawing = false;
  this.drawData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateDraw(element);
}

/**
 * Searches for a crossing of the contour during create. If found, returns the
 * index of the point just before the lines cross.
 */
function findCrossingIndexDuringCreate(
  evt: EventTypes.MouseDragEventType
): number | undefined {
  // Note as we super sample the added points, we need to check the whole last mouse move, not the points
  const eventDetail = evt.detail;
  const { currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPoint = lastPoints.canvas;

  const { canvasPoints } = this.drawData;
  const pointsLessLastOne = canvasPoints.slice(0, -1);

  const lineSegment = getFirstIntersectionWithPolyline(
    pointsLessLastOne,
    canvasPos,
    lastCanvasPoint,
    false
  );

  if (lineSegment === undefined) {
    return;
  }

  const crossingIndex = lineSegment[0];

  return crossingIndex;
}

/**
 * On crossing of the draw line, create a closed contour, and then start an edit
 * since this occurs during a mouse drag.
 */
function applyCreateOnCross(
  evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType,
  crossingIndex: number
): void {
  const eventDetail = evt.detail;
  const { element } = eventDetail;
  const { canvasPoints } = this.drawData;
  const { annotation, viewportIdsToRender } = this.commonData;

  // Add points between the end point and crossing point
  addCanvasPointsToArray(
    element,
    canvasPoints,
    canvasPoints[crossingIndex],
    this.commonData
  );
  // Remove last point which will be a duplicate now.
  canvasPoints.pop();

  // Remove points up to just before the crossing index
  for (let i = 0; i < crossingIndex; i++) {
    canvasPoints.shift();
  }

  this.completeDrawClosedContour(evt);
  this.activateClosedContourEdit(evt, annotation, viewportIdsToRender);
}

/**
 * Registers the contour drawing loop to the tool instance.
 */
function registerDrawLoop(toolInstance): void {
  toolInstance.activateDraw = activateDraw.bind(toolInstance);
  toolInstance.deactivateDraw = deactivateDraw.bind(toolInstance);

  toolInstance.applyCreateOnCross = applyCreateOnCross.bind(toolInstance);
  toolInstance.findCrossingIndexDuringCreate =
    findCrossingIndexDuringCreate.bind(toolInstance);
  toolInstance.completeDrawOpenContour =
    completeDrawOpenContour.bind(toolInstance);
  toolInstance.removeCrossedLinesOnCompleteDraw =
    removeCrossedLinesOnCompleteDraw.bind(toolInstance);
  toolInstance.mouseDragDrawCallback = mouseDragDrawCallback.bind(toolInstance);
  toolInstance.mouseUpDrawCallback = mouseUpDrawCallback.bind(toolInstance);
  toolInstance.completeDrawClosedContour =
    completeDrawClosedContour.bind(toolInstance);
}

export default registerDrawLoop;
