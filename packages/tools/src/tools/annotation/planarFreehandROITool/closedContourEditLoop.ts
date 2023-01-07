import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { state } from '../../../store';
import { Events } from '../../../enums';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';
import { EventTypes } from '../../../types';
import { polyline } from '../../../utilities/math';
import { vec3, vec2 } from 'gl-matrix';
import { PlanarFreehandROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';
import {
  getInterpolatedPoints,
  shouldInterpolate,
} from '../../../utilities/planarFreehandROITool/interpolatePoints';
import triggerAnnotationRenderForViewportIds from '../../../utilities/triggerAnnotationRenderForViewportIds';

const {
  getSubPixelSpacingAndXYDirections,
  addCanvasPointsToArray,
  calculateAreaOfPoints,
} = polyline;

/**
 * Activates the closed contour edit event loop.
 */
function activateClosedContourEdit(
  evt: EventTypes.InteractionEventType,
  annotation: PlanarFreehandROIAnnotation,
  viewportIdsToRender: string[]
): void {
  this.isEditingClosed = true;

  const eventDetail = evt.detail;
  const { currentPoints, element } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const prevCanvasPoints = annotation.data.polyline.map(viewport.worldToCanvas);

  const { spacing, xDir, yDir } = getSubPixelSpacingAndXYDirections(
    viewport,
    this.configuration.subPixelResolution
  );

  this.editData = {
    prevCanvasPoints,
    editCanvasPoints: [canvasPos],
    startCrossingIndex: undefined,
    editIndex: 0,
  };

  this.commonData = {
    annotation,
    viewportIdsToRender,
    spacing,
    xDir,
    yDir,
  };

  state.isInteractingWithTool = true;

  element.addEventListener(
    Events.MOUSE_UP,
    this.mouseUpClosedContourEditCallback
  );
  element.addEventListener(
    Events.MOUSE_DRAG,
    this.mouseDragClosedContourEditCallback
  );
  element.addEventListener(
    Events.MOUSE_CLICK,
    this.mouseUpClosedContourEditCallback
  );

  element.addEventListener(
    Events.TOUCH_END,
    this.mouseUpClosedContourEditCallback
  );
  element.addEventListener(
    Events.TOUCH_DRAG,
    this.mouseDragClosedContourEditCallback
  );
  element.addEventListener(
    Events.TOUCH_TAP,
    this.mouseUpClosedContourEditCallback
  );

  hideElementCursor(element);
}

/**
 * Dectivates and cleans up the closed contour edit event loop.
 */
function deactivateClosedContourEdit(element: HTMLDivElement): void {
  state.isInteractingWithTool = false;

  element.removeEventListener(
    Events.MOUSE_UP,
    this.mouseUpClosedContourEditCallback
  );
  element.removeEventListener(
    Events.MOUSE_DRAG,
    this.mouseDragClosedContourEditCallback
  );
  element.removeEventListener(
    Events.MOUSE_CLICK,
    this.mouseUpClosedContourEditCallback
  );

  element.removeEventListener(
    Events.TOUCH_END,
    this.mouseUpClosedContourEditCallback
  );
  element.removeEventListener(
    Events.TOUCH_DRAG,
    this.mouseDragClosedContourEditCallback
  );
  element.removeEventListener(
    Events.TOUCH_TAP,
    this.mouseUpClosedContourEditCallback
  );

  resetElementCursor(element);
}

/**
 * Adds points to the edit line and calculates the preview of the edit to render.
 * Checks if an edit needs to be completed by crossing of lines, or by editing in
 * a way that requires a new edit to keep the contour a simple polygon.
 */
function mouseDragClosedContourEditCallback(
  evt: EventTypes.InteractionEventType
): Types.Point2[] {
  const eventDetail = evt.detail;
  const { currentPoints, element } = eventDetail;
  const worldPos = currentPoints.world;
  const canvasPos = currentPoints.canvas;
  const enabledElement = getEnabledElement(element);
  const { renderingEngine, viewport } = enabledElement;

  const { viewportIdsToRender, xDir, yDir, spacing } = this.commonData;
  const { editIndex, editCanvasPoints, startCrossingIndex } = this.editData;

  const lastCanvasPoint = editCanvasPoints[editCanvasPoints.length - 1];
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

  if (startCrossingIndex !== undefined) {
    // Edge case: If the edit line itself crosses, remove part of that edit line so we don't
    // Get isolated regions.
    this.checkAndRemoveCrossesOnEditLine(evt);
  }

  const numPointsAdded = addCanvasPointsToArray(
    element,
    editCanvasPoints,
    canvasPos,
    this.commonData
  );

  const currentEditIndex = editIndex + numPointsAdded;

  this.editData.editIndex = currentEditIndex;

  if (startCrossingIndex === undefined && editCanvasPoints.length > 1) {
    // If we haven't found the index of the first crossing yet,
    // see if we can find it.
    this.checkForFirstCrossing(evt, true);
  }

  this.editData.snapIndex = this.findSnapIndex();

  if (this.editData.snapIndex === -1) {
    // No point on the prevCanvasPoints for the editCanvasPoints line to
    // snap to. Apply edit, and start a new edit as we've gone back on ourselves.
    this.finishEditAndStartNewEdit(evt);
    return;
  }

  this.editData.fusedCanvasPoints = this.fuseEditPointsWithClosedContour(evt);

  if (
    startCrossingIndex !== undefined &&
    this.checkForSecondCrossing(evt, true)
  ) {
    // Crossed a second time, apply edit, and start a new edit from the crossing.
    this.removePointsAfterSecondCrossing(true);
    this.finishEditAndStartNewEdit(evt);
  }

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

/**
 * Finish the current edit, and start a new one.
 */
function finishEditAndStartNewEdit(evt: EventTypes.InteractionEventType): void {
  const eventDetail = evt.detail;
  const { element } = eventDetail;
  const enabledElement = getEnabledElement(element);
  const { viewport, renderingEngine } = enabledElement;

  const { annotation, viewportIdsToRender } = this.commonData;
  const { fusedCanvasPoints, editCanvasPoints } = this.editData;

  const worldPoints = fusedCanvasPoints.map((canvasPoint) =>
    viewport.canvasToWorld(canvasPoint)
  );

  annotation.data.polyline = worldPoints;
  annotation.data.isOpenContour = false;

  this.triggerAnnotationModified(annotation, enabledElement);

  const lastEditCanvasPoint = editCanvasPoints.pop();

  this.editData = {
    prevCanvasPoints: fusedCanvasPoints,
    editCanvasPoints: [lastEditCanvasPoint],
    startCrossingIndex: undefined,
    editIndex: 0,
    snapIndex: undefined,
  };

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

/**
 * This method combines the contour before editing (prevCanvasPoints) with
 * the current edit (editCanvasPoints), to produce a renderable preview of the
 * edit. Upon finishing the contour, the preview generated here is written back
 * into the contour state.
 *
 * @privateRemarks In this method we combine a few tricks to find the optimal
 * contour:
 * - As the contour is closed, our edit might stradle the boundary between the
 * last and 0th point of the contour, e.g. a small edit might go from e.g. index
 * 960 to index 4. We therefore calculate two possible contours, and find the
 * one with the biggest area, which will define the actual edit the user desired.
 * - As the contour and the edit can be drawn with different chiralities, we find if
 * the edit line aligns better with the intended cross points in its current order
 * or reversed. We do this by minimising the distance between its ends and the
 * intended crossing points.
 */
function fuseEditPointsWithClosedContour(
  evt: EventTypes.InteractionEventType
): Types.Point2[] {
  const { prevCanvasPoints, editCanvasPoints, startCrossingIndex, snapIndex } =
    this.editData;

  if (startCrossingIndex === undefined || snapIndex === undefined) {
    return;
  }

  const eventDetail = evt.detail;
  const { element } = eventDetail;

  // Augment the editCanvasPoints array, between the end of edit and the snap index.
  const augmentedEditCanvasPoints = [...editCanvasPoints];

  addCanvasPointsToArray(
    element,
    augmentedEditCanvasPoints,
    prevCanvasPoints[snapIndex],
    this.commonData
  );

  if (augmentedEditCanvasPoints.length > editCanvasPoints.length) {
    // If any points added, remove the last point, which will be a clone of the snapIndex
    augmentedEditCanvasPoints.pop();
  }

  // Calculate the distances between the first and last edit points and the origin of the
  // Contour with the snap point. These will be used to see which way around the edit array should be
  // Placed within the preview.
  let lowIndex;
  let highIndex;

  if (startCrossingIndex > snapIndex) {
    lowIndex = snapIndex;
    highIndex = startCrossingIndex;
  } else {
    lowIndex = startCrossingIndex;
    highIndex = snapIndex;
  }

  const distanceBetweenLowAndFirstPoint = vec2.distance(
    prevCanvasPoints[lowIndex],
    augmentedEditCanvasPoints[0]
  );

  const distanceBetweenLowAndLastPoint = vec2.distance(
    prevCanvasPoints[lowIndex],
    augmentedEditCanvasPoints[augmentedEditCanvasPoints.length - 1]
  );

  const distanceBetweenHighAndFirstPoint = vec2.distance(
    prevCanvasPoints[highIndex],
    augmentedEditCanvasPoints[0]
  );

  const distanceBetweenHighAndLastPoint = vec2.distance(
    prevCanvasPoints[highIndex],
    augmentedEditCanvasPoints[augmentedEditCanvasPoints.length - 1]
  );

  // Generate two possible contours that could be intepreted from the edit:
  //
  // pointSet1 => 0 -> low -> edit -> high - max.
  // pointSet2 => low -> high -> edit
  //
  // Depending on the placement of the edit and the origin, either of these could be the intended edit.
  // We'll choose the one with the largest area, as edits are considered to be changes to the original area with
  // A relative change of much less than unity.

  // Point Set 1
  const pointSet1 = [];

  // Add points from the orignal contour origin up to the low index.
  for (let i = 0; i < lowIndex; i++) {
    const canvasPoint = prevCanvasPoints[i];

    pointSet1.push([canvasPoint[0], canvasPoint[1]]);
  }

  // Check which orientation of the edit line minimizes the distance between the
  // origial contour low/high points and the start/end nodes of the edit line.

  let inPlaceDistance =
    distanceBetweenLowAndFirstPoint + distanceBetweenHighAndLastPoint;

  let reverseDistance =
    distanceBetweenLowAndLastPoint + distanceBetweenHighAndFirstPoint;

  if (inPlaceDistance < reverseDistance) {
    for (let i = 0; i < augmentedEditCanvasPoints.length; i++) {
      const canvasPoint = augmentedEditCanvasPoints[i];

      pointSet1.push([canvasPoint[0], canvasPoint[1]]);
    }
  } else {
    for (let i = augmentedEditCanvasPoints.length - 1; i >= 0; i--) {
      const canvasPoint = augmentedEditCanvasPoints[i];

      pointSet1.push([canvasPoint[0], canvasPoint[1]]);
    }
  }

  // Add points from the orignal contour's high index up to to its end point.
  for (let i = highIndex; i < prevCanvasPoints.length; i++) {
    const canvasPoint = prevCanvasPoints[i];

    pointSet1.push([canvasPoint[0], canvasPoint[1]]);
  }

  // Point Set 2
  const pointSet2 = [];

  for (let i = lowIndex; i < highIndex; i++) {
    const canvasPoint = prevCanvasPoints[i];

    pointSet2.push([canvasPoint[0], canvasPoint[1]]);
  }

  inPlaceDistance =
    distanceBetweenHighAndFirstPoint + distanceBetweenLowAndLastPoint;

  reverseDistance =
    distanceBetweenHighAndLastPoint + distanceBetweenLowAndFirstPoint;

  if (inPlaceDistance < reverseDistance) {
    for (let i = 0; i < augmentedEditCanvasPoints.length; i++) {
      const canvasPoint = augmentedEditCanvasPoints[i];

      pointSet2.push([canvasPoint[0], canvasPoint[1]]);
    }
  } else {
    for (let i = augmentedEditCanvasPoints.length - 1; i >= 0; i--) {
      const canvasPoint = augmentedEditCanvasPoints[i];

      pointSet2.push([canvasPoint[0], canvasPoint[1]]);
    }
  }

  const areaPointSet1 = calculateAreaOfPoints(pointSet1);
  const areaPointSet2 = calculateAreaOfPoints(pointSet2);

  const pointsToRender: Types.Point2[] =
    areaPointSet1 > areaPointSet2 ? pointSet1 : pointSet2;

  return pointsToRender;
}

/**
 * Completes the edit of the closed contour when the mouse button is released.
 */
function mouseUpClosedContourEditCallback(
  evt: EventTypes.InteractionEventType
): void {
  const eventDetail = evt.detail;
  const { element } = eventDetail;

  this.completeClosedContourEdit(element);
}

/**
 * Completes the edit of the closed contour when the mouse button is released.
 */
function completeClosedContourEdit(element: HTMLDivElement) {
  const enabledElement = getEnabledElement(element);
  const { viewport, renderingEngine } = enabledElement;

  const { annotation, viewportIdsToRender } = this.commonData;
  const { fusedCanvasPoints, prevCanvasPoints } = this.editData;

  if (fusedCanvasPoints) {
    const updatedPoints = shouldInterpolate(this.configuration)
      ? getInterpolatedPoints(
          this.configuration,
          fusedCanvasPoints,
          prevCanvasPoints
        )
      : fusedCanvasPoints;

    const worldPoints = updatedPoints.map((canvasPoint) =>
      viewport.canvasToWorld(canvasPoint)
    );
    annotation.data.polyline = worldPoints;
    annotation.data.isOpenContour = false;

    this.triggerAnnotationModified(annotation, enabledElement);
  }

  this.isEditingClosed = false;
  this.editData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateClosedContourEdit(element);
}

/**
 * Completes the edit on a cancel method call during the closed
 * contour edit loop.
 */
function cancelClosedContourEdit(element: HTMLDivElement) {
  this.completeClosedContourEdit(element);
}

/**
 * Registers the closed contour edit loop to the tool instance.
 */
function registerClosedContourEditLoop(toolInstance): void {
  toolInstance.activateClosedContourEdit =
    activateClosedContourEdit.bind(toolInstance);
  toolInstance.deactivateClosedContourEdit =
    deactivateClosedContourEdit.bind(toolInstance);
  toolInstance.mouseDragClosedContourEditCallback =
    mouseDragClosedContourEditCallback.bind(toolInstance);
  toolInstance.mouseUpClosedContourEditCallback =
    mouseUpClosedContourEditCallback.bind(toolInstance);
  toolInstance.finishEditAndStartNewEdit =
    finishEditAndStartNewEdit.bind(toolInstance);
  toolInstance.fuseEditPointsWithClosedContour =
    fuseEditPointsWithClosedContour.bind(toolInstance);
  toolInstance.cancelClosedContourEdit =
    cancelClosedContourEdit.bind(toolInstance);
  toolInstance.completeClosedContourEdit =
    completeClosedContourEdit.bind(toolInstance);
}

export default registerClosedContourEditLoop;
