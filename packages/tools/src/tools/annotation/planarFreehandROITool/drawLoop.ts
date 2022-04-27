import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';
import { Events } from '../../../enums';
import { EventTypes } from '../../types';
import { state } from '../../../store';
import { vec3 } from 'gl-matrix';
import triggerAnnotationRenderForViewportIds from '../../../utilities/triggerAnnotationRenderForViewportIds';
import { polyline } from '../../../utilities/math';

const {
  addCanvasPointsToArray,
  pointsAreWithinCloseContourProximity,
  getFirstIntersectionWithPolyline,
  getSpacingAndXYDirections,
} = polyline;

function activateDraw(
  evt: EventTypes.MouseDownActivateEventType,
  annotation: Types.Annotation,
  viewportIdsToRender: string[]
) {
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

function deactivateDraw(element: HTMLDivElement) {
  state.isInteractingWithTool = false;

  element.removeEventListener(Events.MOUSE_UP, this.mouseUpDrawCallback);
  element.removeEventListener(Events.MOUSE_DRAG, this.mouseDragDrawCallback);
  element.removeEventListener(Events.MOUSE_CLICK, this.mouseUpDrawCallback);

  resetElementCursor(element);
}

function mouseDragDrawCallback(
  evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
) {
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

  // Get pixel spacing in the direction.
  // Check that we have moved at least one voxel in each direction.

  if (xDist <= spacing[0] && yDist <= spacing[1]) {
    // Haven't changed world point enough, don't render
    return;
  }

  const crossingPoint = this.findCrossDuringCreate(evt);

  if (crossingPoint) {
    this.applyCreateOnCross(evt, crossingPoint);
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

function mouseUpDrawCallback(
  evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
) {
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
    this.completeDrawContour(evt);
  }
}

function completeDrawContour(
  evt:
    | EventTypes.MouseUpEventType
    | EventTypes.MouseClickEventType
    | EventTypes.MouseDragEventType
) {
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

  // Note: -> This is pretty expensive and may note scale well with hundreds of contours.
  // It would be best if we could get the transformation matrix and then just
  // apply this to the points, but its still 16 multiplications per point.
  const worldPoints = canvasPoints.map((canvasPoint) =>
    viewport.canvasToWorld(canvasPoint)
  );

  annotation.data.polyline = worldPoints;
  annotation.data.isOpenContour = false;

  this.isDrawing = false;
  this.drawData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateDraw(element);
}

function removeCrossedLinesOnCompleteDraw() {
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

function completeDrawOpenContour(
  evt:
    | EventTypes.MouseUpEventType
    | EventTypes.MouseClickEventType
    | EventTypes.MouseDragEventType
) {
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

  annotation.data.polyline = worldPoints;
  annotation.data.isOpenContour = true;
  // The first and land points as handles
  annotation.data.handles.points = [
    worldPoints[0],
    worldPoints[worldPoints.length - 1],
  ];

  this.isDrawing = false;
  this.drawData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateDraw(element);
}

function findCrossDuringCreate(evt): boolean {
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

  return lineSegment;
}

function applyCreateOnCross(evt, crossingPoint) {
  const eventDetail = evt.detail;
  const { element } = eventDetail;
  // Remove the crossed points
  const { canvasPoints } = this.drawData;
  const { annotation, viewportIdsToRender } = this.commonData;

  const crossingIndex = crossingPoint[0];

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

  // Complete contour
  this.completeDrawContour(evt);

  this.activateClosedContourEdit(evt, annotation, viewportIdsToRender);
}

function registerDrawLoop(toolInstance) {
  toolInstance.activateDraw = activateDraw.bind(toolInstance);
  toolInstance.deactivateDraw = deactivateDraw.bind(toolInstance);

  toolInstance.applyCreateOnCross = applyCreateOnCross.bind(toolInstance);
  toolInstance.findCrossDuringCreate = findCrossDuringCreate.bind(toolInstance);
  toolInstance.completeDrawOpenContour =
    completeDrawOpenContour.bind(toolInstance);
  toolInstance.removeCrossedLinesOnCompleteDraw =
    removeCrossedLinesOnCompleteDraw.bind(toolInstance);
  toolInstance.mouseDragDrawCallback = mouseDragDrawCallback.bind(toolInstance);
  toolInstance.mouseUpDrawCallback = mouseUpDrawCallback.bind(toolInstance);
  toolInstance.completeDrawContour = completeDrawContour.bind(toolInstance);
}

export default registerDrawLoop;
