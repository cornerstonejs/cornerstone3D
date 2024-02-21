import { getEnabledElement, utilities } from '@cornerstonejs/core';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';
import { Events } from '../../../enums';
import { EventTypes } from '../../../types';
import { state } from '../../../store';
import { vec3 } from 'gl-matrix';
import {
  shouldSmooth,
  getInterpolatedPoints,
} from '../../../utilities/planarFreehandROITool/smoothPoints';
import getMouseModifierKey from '../../../eventDispatchers/shared/getMouseModifier';
import triggerAnnotationRenderForViewportIds from '../../../utilities/triggerAnnotationRenderForViewportIds';
import { triggerContourAnnotationCompleted } from '../../../stateManagement/annotation/helpers/state';
import { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import findOpenUShapedContourVectorToPeak from './findOpenUShapedContourVectorToPeak';
import { polyline } from '../../../utilities/math';
import { removeAnnotation } from '../../../stateManagement/annotation/annotationState';
import reverseIfAntiClockwise from '../../../utilities/contours/reverseIfAntiClockwise';

const {
  addCanvasPointsToArray,
  pointsAreWithinCloseContourProximity,
  getFirstLineSegmentIntersectionIndexes,
  getSubPixelSpacingAndXYDirections,
} = polyline;

/**
 * Activates the contour drawing event loop.
 */
function activateDraw(
  evt: EventTypes.InteractionEventType,
  annotation: PlanarFreehandROIAnnotation,
  viewportIdsToRender: string[]
): void {
  this.isDrawing = true;

  const eventDetail = evt.detail;
  const { currentPoints, element } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;
  const contourHoleProcessingEnabled =
    getMouseModifierKey(evt.detail.event) ===
    this.configuration.contourHoleAdditionModifierKey;

  const { spacing, xDir, yDir } = getSubPixelSpacingAndXYDirections(
    viewport,
    this.configuration.subPixelResolution
  );

  this.drawData = {
    canvasPoints: [canvasPos],
    polylineIndex: 0,
    contourHoleProcessingEnabled,
  };

  this.commonData = {
    annotation,
    viewportIdsToRender,
    spacing,
    xDir,
    yDir,
    movingTextBox: false,
  };

  state.isInteractingWithTool = true;

  element.addEventListener(Events.MOUSE_UP, this.mouseUpDrawCallback);
  element.addEventListener(Events.MOUSE_DRAG, this.mouseDragDrawCallback);
  element.addEventListener(Events.MOUSE_CLICK, this.mouseUpDrawCallback);
  element.addEventListener(Events.TOUCH_END, this.mouseUpDrawCallback);
  element.addEventListener(Events.TOUCH_DRAG, this.mouseDragDrawCallback);
  element.addEventListener(Events.TOUCH_TAP, this.mouseUpDrawCallback);

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
  element.removeEventListener(Events.TOUCH_END, this.mouseUpDrawCallback);
  element.removeEventListener(Events.TOUCH_DRAG, this.mouseDragDrawCallback);
  element.removeEventListener(Events.TOUCH_TAP, this.mouseUpDrawCallback);

  resetElementCursor(element);
}

/**
 * Adds points to a set of preview canvas points of the contour being created.
 * Checks if crossing of lines means early completion and editing needs to be started.
 */
function mouseDragDrawCallback(evt: EventTypes.InteractionEventType): void {
  const eventDetail = evt.detail;
  const { currentPoints, element } = eventDetail;
  const worldPos = currentPoints.world;
  const canvasPos = currentPoints.canvas;
  const enabledElement = getEnabledElement(element);
  const { renderingEngine, viewport } = enabledElement;

  const {
    annotation,
    viewportIdsToRender,
    xDir,
    yDir,
    spacing,
    movingTextBox,
  } = this.commonData;
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

  if (movingTextBox) {
    this.isDrawing = false;

    // Drag mode - Move the text boxes world position
    const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
    const worldPosDelta = deltaPoints.world;

    const { textBox } = annotation.data.handles;
    const { worldPosition } = textBox;

    worldPosition[0] += worldPosDelta[0];
    worldPosition[1] += worldPosDelta[1];
    worldPosition[2] += worldPosDelta[2];

    textBox.hasMoved = true;
  } else {
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
  }

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

/**
 * Completes the contour on mouse up. If the `allowOpenContours` configuration
 * option is `true`, checks if we should create an open or closed contour.
 * If the `allowOpenContours` configuration option is `false`, always creates a
 * closed contour.
 */
function mouseUpDrawCallback(evt: EventTypes.InteractionEventType): void {
  const { allowOpenContours } = this.configuration;
  const { canvasPoints, contourHoleProcessingEnabled } = this.drawData;
  const firstPoint = canvasPoints[0];
  const lastPoint = canvasPoints[canvasPoints.length - 1];
  const eventDetail = evt.detail;
  const { element } = eventDetail;

  if (
    allowOpenContours &&
    !pointsAreWithinCloseContourProximity(
      firstPoint,
      lastPoint,
      this.configuration.closeContourProximity
    )
  ) {
    this.completeDrawOpenContour(element, { contourHoleProcessingEnabled });
  } else {
    this.completeDrawClosedContour(element, { contourHoleProcessingEnabled });
  }
}

/**
 * Completes the contour being drawn, creating a closed contour annotation. It will return true if contour is completed or false in case contour drawing is halted.
 */
function completeDrawClosedContour(
  element: HTMLDivElement,
  options: {
    contourHoleProcessingEnabled: boolean;
    minPointsToSave: number;
  }
): boolean {
  this.removeCrossedLinesOnCompleteDraw();

  const { canvasPoints } = this.drawData;
  const { contourHoleProcessingEnabled, minPointsToSave } = options ?? {};

  if (minPointsToSave && canvasPoints.length < minPointsToSave) {
    return false;
  }

  // check and halt if necessary the drawing process, last chance to complete drawing and fire events.
  if (this.haltDrawing(element, canvasPoints)) {
    return false;
  }

  const { annotation, viewportIdsToRender } = this.commonData;
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

  const clockwise = this.configuration.makeClockWise
    ? reverseIfAntiClockwise(canvasPoints)
    : canvasPoints;

  const updatedPoints = shouldSmooth(this.configuration, annotation)
    ? getInterpolatedPoints(this.configuration, clockwise)
    : clockwise;

  this.updateContourPolyline(
    annotation,
    {
      points: updatedPoints,
      closed: true,
    },
    viewport
  );

  const { textBox } = annotation.data.handles;

  if (!textBox?.hasMoved) {
    triggerContourAnnotationCompleted(annotation, contourHoleProcessingEnabled);
  }

  this.isDrawing = false;
  this.drawData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateDraw(element);

  return true;
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

  const lineSegment = getFirstLineSegmentIntersectionIndexes(
    canvasPointsMinusEnds,
    endToStart[0],
    endToStart[1],
    false
  );

  if (lineSegment) {
    const indexToRemoveUpTo = lineSegment[1];

    // It is better to remove the last point when the user just moved the mouse
    // cursor back than deleting the entire contour
    if (indexToRemoveUpTo === 1) {
      this.drawData.canvasPoints = canvasPoints.splice(1);
    } else {
      this.drawData.canvasPoints = canvasPoints.splice(0, indexToRemoveUpTo);
    }
  }
}

/**
 * Completes the contour being drawn, creating an open contour annotation. It will return true if contour is completed or false in case contour drawing is halted.
 */
function completeDrawOpenContour(
  element: HTMLDivElement,
  options: {
    contourHoleProcessingEnabled: boolean;
  }
): boolean {
  const { canvasPoints } = this.drawData;
  const { contourHoleProcessingEnabled } = options ?? {};

  // check and halt if necessary the drawing process, last chance to complete drawing and fire events.
  if (this.haltDrawing(element, canvasPoints)) {
    return false;
  }

  const { annotation, viewportIdsToRender } = this.commonData;
  const enabledElement = getEnabledElement(element);
  const { viewport, renderingEngine } = enabledElement;

  const updatedPoints = shouldSmooth(this.configuration, annotation)
    ? getInterpolatedPoints(this.configuration, canvasPoints)
    : canvasPoints;

  // Note: -> This is pretty expensive and may not scale well with hundreds of
  // contours. A future optimisation if we use this for segmentation is to re-do
  // this rendering with the GPU rather than SVG.

  this.updateContourPolyline(
    annotation,
    {
      points: updatedPoints,
      closed: false,
    },
    viewport
  );

  const { textBox } = annotation.data.handles;
  const worldPoints = annotation.data.contour.polyline;

  // Add the first and last points to the list of handles. These means they
  // will render handles on mouse hover.
  annotation.data.handles.points = [
    worldPoints[0],
    worldPoints[worldPoints.length - 1],
  ];

  // If the annotation is an open U-shaped annotation, find the annotation vector.
  if (annotation.data.isOpenUShapeContour) {
    annotation.data.openUShapeContourVectorToPeak =
      findOpenUShapedContourVectorToPeak(canvasPoints, viewport);
  }

  if (!textBox.hasMoved) {
    triggerContourAnnotationCompleted(annotation, contourHoleProcessingEnabled);
  }

  this.isDrawing = false;
  this.drawData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateDraw(element);

  return true;
}

/**
 * Searches for a crossing of the contour during create. If found, returns the
 * index of the point just before the lines cross.
 */
function findCrossingIndexDuringCreate(
  evt: EventTypes.InteractionEventType
): number | undefined {
  // Note as we super sample the added points, we need to check the whole last mouse move, not the points
  const eventDetail = evt.detail;
  const { currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPoint = lastPoints.canvas;

  const { canvasPoints } = this.drawData;
  const pointsLessLastOne = canvasPoints.slice(0, -1);

  const lineSegment = getFirstLineSegmentIntersectionIndexes(
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
  evt: EventTypes.InteractionEventType,
  crossingIndex: number
): void {
  const eventDetail = evt.detail;
  const { element } = eventDetail;
  const { canvasPoints, contourHoleProcessingEnabled } = this.drawData;
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

  const remainingPoints = canvasPoints.slice(crossingIndex);
  const newArea = polyline.getArea(remainingPoints);

  // User just moved the mouse back and the last points must be removed
  // otherwise the entire contour drawn would be lost.
  if (utilities.isEqual(newArea, 0)) {
    canvasPoints.splice(crossingIndex + 1);
    return;
  }

  canvasPoints.splice(0, crossingIndex);

  // There is no contour with less than 3 points.
  // It's possible to have a contour with very few points after removing
  // crossed lines which is not enough to save as a contour.
  const options = { contourHoleProcessingEnabled, minPointsToSave: 3 };

  if (this.completeDrawClosedContour(element, options)) {
    // pos complete operation
    this.activateClosedContourEdit(evt, annotation, viewportIdsToRender);
  }
}

/**
 * Completes the contour on a cancel method call during the draw loop.
 */
function cancelDrawing(element: HTMLElement) {
  const { allowOpenContours } = this.configuration;
  const { canvasPoints, contourHoleProcessingEnabled } = this.drawData;
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
    this.completeDrawOpenContour(element, { contourHoleProcessingEnabled });
  } else {
    this.completeDrawClosedContour(element, { contourHoleProcessingEnabled });
  }
}

/**
 * Tell whether a drawing should be halted or not. It will be true when canvas points is less than the minimum required.
 */
function shouldHaltDrawing(
  canvasPoints: any,
  subPixelResolution: number
): boolean {
  const minPoints = Math.max(
    /**
     * The number of points to span 3 voxels in length, this is a realistically
     * smallest open contour one could reasonably define (2 voxels should probably be a line).
     */
    subPixelResolution * 3,
    /**
     * Minimum 3 points, there are other annotations for one point (probe)
     * or 2 points (line), so this comes only from a mistake in practice.
     */
    3
  );
  return canvasPoints.length < minPoints;
}

/**
 * Check and halt a drawing for a given event. It returns true in case drawing is halted, otherswise false.
 */
function haltDrawing(element: HTMLDivElement, canvasPoints: any): boolean {
  const { subPixelResolution } = this.configuration;

  if (shouldHaltDrawing(canvasPoints, subPixelResolution)) {
    // Remove annotation instead of completing it.
    const { annotation, viewportIdsToRender } = this.commonData;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    removeAnnotation(annotation.annotationUID);

    this.isDrawing = false;
    this.drawData = undefined;
    this.commonData = undefined;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    this.deactivateDraw(element);

    return true;
  }

  return false;
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
  toolInstance.cancelDrawing = cancelDrawing.bind(toolInstance);
  toolInstance.haltDrawing = haltDrawing.bind(toolInstance);
}

export default registerDrawLoop;
