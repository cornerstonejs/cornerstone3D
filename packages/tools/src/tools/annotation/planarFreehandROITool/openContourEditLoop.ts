import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { state } from '../../../store';
import { Events } from '../../../enums';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';
import type { EventTypes, Annotation } from '../../../types';
import { vec3, vec2 } from 'gl-matrix';
import { polyline } from '../../../utilities/math';
import {
  shouldInterpolate,
  getInterpolatedPoints,
} from '../../../utilities/planarFreehandROITool/interpolatePoints';
import triggerAnnotationRenderForViewportIds from '../../../utilities/triggerAnnotationRenderForViewportIds';
import findOpenUShapedContourVectorToPeak from './findOpenUShapedContourVectorToPeak';

const { addCanvasPointsToArray, getSubPixelSpacingAndXYDirections } = polyline;

/**
 * Activates the open contour edit event loop.
 */
function activateOpenContourEdit(
  evt: EventTypes.InteractionEventType,
  annotation: Annotation,
  viewportIdsToRender: string[]
): void {
  this.isEditingOpen = true;

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
    this.mouseUpOpenContourEditCallback
  );
  element.addEventListener(
    Events.MOUSE_DRAG,
    this.mouseDragOpenContourEditCallback
  );
  element.addEventListener(
    Events.MOUSE_CLICK,
    this.mouseUpOpenContourEditCallback
  );

  element.addEventListener(
    Events.TOUCH_END,
    this.mouseUpOpenContourEditCallback
  );
  element.addEventListener(
    Events.TOUCH_DRAG,
    this.mouseDragOpenContourEditCallback
  );
  element.addEventListener(
    Events.TOUCH_TAP,
    this.mouseUpOpenContourEditCallback
  );
  hideElementCursor(element);
}

/**
 * Deactivates and cleans up the closed contour edit event loop.
 */
function deactivateOpenContourEdit(element: HTMLDivElement) {
  state.isInteractingWithTool = false;

  element.removeEventListener(
    Events.MOUSE_UP,
    this.mouseUpOpenContourEditCallback
  );
  element.removeEventListener(
    Events.MOUSE_DRAG,
    this.mouseDragOpenContourEditCallback
  );
  element.removeEventListener(
    Events.MOUSE_CLICK,
    this.mouseUpOpenContourEditCallback
  );

  element.removeEventListener(
    Events.TOUCH_END,
    this.mouseUpOpenContourEditCallback
  );
  element.removeEventListener(
    Events.TOUCH_DRAG,
    this.mouseDragOpenContourEditCallback
  );
  element.removeEventListener(
    Events.TOUCH_TAP,
    this.mouseUpOpenContourEditCallback
  );
  resetElementCursor(element);
}

/**
 * Adds points to the edit line and calculates the preview of the edit to render.
 * Checks if an edit needs to be completed by crossing of lines, or by dragging
 * the edit line past the end of the open contour.
 */
function mouseDragOpenContourEditCallback(
  evt: EventTypes.InteractionEventType
): boolean {
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

  // Get pixel spacing in the direction.
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
    this.checkForFirstCrossing(evt, false);
  }

  this.editData.snapIndex = this.findSnapIndex();

  this.editData.fusedCanvasPoints = this.fuseEditPointsWithOpenContour(evt);

  if (
    startCrossingIndex !== undefined &&
    this.checkForSecondCrossing(evt, false)
  ) {
    this.removePointsAfterSecondCrossing(false);
    this.finishEditOpenOnSecondCrossing(evt);
  } else if (this.checkIfShouldOverwriteAnEnd(evt)) {
    this.openContourEditOverwriteEnd(evt);
  }

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

/**
 * Overwrite the end of the contour with the edit, and then switch to the
 * open contour end edit loop.
 */
function openContourEditOverwriteEnd(
  evt: EventTypes.InteractionEventType
): void {
  const eventDetail = evt.detail;
  const { element } = eventDetail;
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;
  const { annotation, viewportIdsToRender } = this.commonData;
  const fusedCanvasPoints = this.fuseEditPointsForOpenContourEndEdit();

  const worldPoints = fusedCanvasPoints.map((canvasPoint) =>
    viewport.canvasToWorld(canvasPoint)
  );

  annotation.data.polyline = worldPoints;
  annotation.data.isOpenContour = true;
  // Note: Contours generate from fusedCanvasPoints will be in the direction
  // with the last point being the current mouse position
  annotation.data.handles.points = [
    worldPoints[0],
    worldPoints[worldPoints.length - 1],
  ];
  annotation.data.handles.activeHandleIndex = 1;

  this.triggerAnnotationModified(annotation, enabledElement);

  this.isEditingOpen = false;
  this.editData = undefined;
  this.commonData = undefined;

  // Jump to a normal line edit now.
  this.deactivateOpenContourEdit(element);
  this.activateOpenContourEndEdit(evt, annotation, viewportIdsToRender);
}

/**
 * Checks if we are moving the `editCanvasPoints` past the end of one of the
 * open contour's `prevCanvasPoint`s.
 */
function checkIfShouldOverwriteAnEnd(
  evt: EventTypes.InteractionEventType
): boolean {
  const eventDetail = evt.detail;
  const { currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPos = lastPoints.canvas;

  const { snapIndex, prevCanvasPoints, startCrossingIndex } = this.editData;

  if (startCrossingIndex === undefined || snapIndex === undefined) {
    // Edit not started
    return false;
  }

  // No snap index can be found, so contour is being edited away from line.
  if (snapIndex === -1) {
    return true;
  }

  if (snapIndex !== 0 && snapIndex !== prevCanvasPoints.length - 1) {
    // Not snapping to final index
    return false;
  }

  // Work out the angle between the last mouse move and
  // And the current point to the snapped point.
  const p1 = canvasPos;
  const p2 = lastCanvasPos;
  const p3 = prevCanvasPoints[snapIndex];

  const a = vec2.create();
  const b = vec2.create();

  vec2.set(a, p1[0] - p2[0], p1[1] - p2[1]);
  vec2.set(b, p1[0] - p3[0], p1[1] - p3[1]);

  const aDotb = vec2.dot(a, b);
  const magA = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  const magB = Math.sqrt(b[0] * b[0] + b[1] * b[1]);

  const theta = Math.acos(aDotb / (magA * magB));

  if (theta < Math.PI / 2) {
    return true;
  }

  return false;
}

/**
 * This method combines the contour before editing (prevCanvasPoints) with
 * the current edit (editCanvasPoints), to produce a single contour ready for
 * end editing.
 *
 * @privateRemarks In this method we use the following trick to find the
 * optimal contour:
 * - As the contour and the edit can be drawn with different chiralities, we find if
 * the edit line aligns better with the intended cross points in its current order
 * or reversed. We do this by minimising the distance between its ends and the
 * intended crossing points.
 */
function fuseEditPointsForOpenContourEndEdit(): Types.Point2[] {
  const { snapIndex, prevCanvasPoints, editCanvasPoints, startCrossingIndex } =
    this.editData;

  const newCanvasPoints = [];

  // Note: Generated contours will both be in the direction with the
  // last point being the current mouse position

  if (snapIndex === 0) {
    // end -> crossingpoint -> edit
    // Add points from the end of the previous contour, to the crossing point.
    for (let i = prevCanvasPoints.length - 1; i >= startCrossingIndex; i--) {
      const canvasPoint = prevCanvasPoints[i];

      newCanvasPoints.push([canvasPoint[0], canvasPoint[1]]);
    }
  } else {
    // start -> crossingpoint -> edit
    // Add points from the orignal contour origin up to the low index.
    for (let i = 0; i < startCrossingIndex; i++) {
      const canvasPoint = prevCanvasPoints[i];

      newCanvasPoints.push([canvasPoint[0], canvasPoint[1]]);
    }
  }

  const distanceBetweenCrossingIndexAndFirstPoint = vec2.distance(
    prevCanvasPoints[startCrossingIndex],
    editCanvasPoints[0]
  );

  const distanceBetweenCrossingIndexAndLastPoint = vec2.distance(
    prevCanvasPoints[startCrossingIndex],
    editCanvasPoints[editCanvasPoints.length - 1]
  );

  if (
    distanceBetweenCrossingIndexAndFirstPoint <
    distanceBetweenCrossingIndexAndLastPoint
  ) {
    // In order
    for (let i = 0; i < editCanvasPoints.length; i++) {
      const canvasPoint = editCanvasPoints[i];

      newCanvasPoints.push([canvasPoint[0], canvasPoint[1]]);
    }
  } else {
    // reverse
    for (let i = editCanvasPoints.length - 1; i >= 0; i--) {
      const canvasPoint = editCanvasPoints[i];

      newCanvasPoints.push([canvasPoint[0], canvasPoint[1]]);
    }
  }

  return newCanvasPoints;
}

/**
 * This method combines the contour before editing (prevCanvasPoints) with
 * the current edit (editCanvasPoints), to produce a renderable preview of the
 * edit. Upon finishing the contour, the preview generated here is written back
 * into the contour state.
 *
 * @privateRemarks In this method we use the following trick to find the
 * optimal contour:
 * - As the contour and the edit can be drawn with different chiralities, we find if
 * the edit line aligns better with the intended cross points in its current order
 * or reversed. We do this by minimising the distance between its ends and the
 * intended crossing points.
 */
function fuseEditPointsWithOpenContour(
  evt: EventTypes.InteractionEventType
): Types.Point2[] {
  const { prevCanvasPoints, editCanvasPoints, startCrossingIndex, snapIndex } =
    this.editData;

  if (startCrossingIndex === undefined || snapIndex === undefined) {
    return undefined;
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

  const pointsToRender = [];

  // Add points from the orignal contour origin up to the low index.
  for (let i = 0; i < lowIndex; i++) {
    const canvasPoint = prevCanvasPoints[i];

    pointsToRender.push([canvasPoint[0], canvasPoint[1]]);
  }

  // Check which orientation of the edit line minimizes the distance between the
  // origial contour low/high points and the start/end nodes of the edit line.

  const inPlaceDistance =
    distanceBetweenLowAndFirstPoint + distanceBetweenHighAndLastPoint;

  const reverseDistance =
    distanceBetweenLowAndLastPoint + distanceBetweenHighAndFirstPoint;

  if (inPlaceDistance < reverseDistance) {
    for (let i = 0; i < augmentedEditCanvasPoints.length; i++) {
      const canvasPoint = augmentedEditCanvasPoints[i];

      pointsToRender.push([canvasPoint[0], canvasPoint[1]]);
    }
  } else {
    for (let i = augmentedEditCanvasPoints.length - 1; i >= 0; i--) {
      const canvasPoint = augmentedEditCanvasPoints[i];

      pointsToRender.push([canvasPoint[0], canvasPoint[1]]);
    }
  }

  // Add points from the original contour's high index up to to its end point.
  for (let i = highIndex; i < prevCanvasPoints.length; i++) {
    const canvasPoint = prevCanvasPoints[i];

    pointsToRender.push([canvasPoint[0], canvasPoint[1]]);
  }

  return pointsToRender;
}

/**
 * On a second crossing, apply edit, and start a new edit from the crossing.
 */
function finishEditOpenOnSecondCrossing(
  evt: EventTypes.InteractionEventType
): void {
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
  annotation.data.isOpenContour = true;
  annotation.data.handles.points = [
    worldPoints[0],
    worldPoints[worldPoints.length - 1],
  ];

  this.triggerAnnotationModified(annotation, enabledElement);

  const lastEditCanvasPoint = editCanvasPoints.pop();

  this.editData = {
    prevCanvasPoints: fusedCanvasPoints,
    editCanvasPoints: [lastEditCanvasPoint],
    startCrossingIndex: undefined,
    editIndex: 0,
  };

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

/**
 * Completes the edit of the open contour when the mouse button is released.
 */
function mouseUpOpenContourEditCallback(
  evt: EventTypes.InteractionEventType
): void {
  const eventDetail = evt.detail;
  const { element } = eventDetail;

  this.completeOpenContourEdit(element);
}

/**
 * Completes the edit of the open contour.
 */
function completeOpenContourEdit(element: HTMLDivElement) {
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
    annotation.data.isOpenContour = true;
    annotation.data.handles.points = [
      worldPoints[0],
      worldPoints[worldPoints.length - 1],
    ];

    // If the annotation is an open U-shaped annotation, find the annotation vector.
    if (annotation.data.isOpenUShapeContour) {
      annotation.data.openUShapeContourVectorToPeak =
        findOpenUShapedContourVectorToPeak(fusedCanvasPoints, viewport);
    }

    this.triggerAnnotationModified(annotation, enabledElement);
  }

  this.isEditingOpen = false;
  this.editData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateOpenContourEdit(element);
}

/**
 * Completes the edit on a cancel method call during the open
 * contour edit loop.
 */
function cancelOpenContourEdit(element: HTMLDivElement) {
  this.completeOpenContourEdit(element);
}

/**
 * Registers the open contour edit loop to the tool instance.
 */
function registerOpenContourEditLoop(toolInstance) {
  toolInstance.activateOpenContourEdit =
    activateOpenContourEdit.bind(toolInstance);
  toolInstance.deactivateOpenContourEdit =
    deactivateOpenContourEdit.bind(toolInstance);
  toolInstance.mouseDragOpenContourEditCallback =
    mouseDragOpenContourEditCallback.bind(toolInstance);
  toolInstance.mouseUpOpenContourEditCallback =
    mouseUpOpenContourEditCallback.bind(toolInstance);
  toolInstance.fuseEditPointsWithOpenContour =
    fuseEditPointsWithOpenContour.bind(toolInstance);
  toolInstance.finishEditOpenOnSecondCrossing =
    finishEditOpenOnSecondCrossing.bind(toolInstance);
  toolInstance.checkIfShouldOverwriteAnEnd =
    checkIfShouldOverwriteAnEnd.bind(toolInstance);
  toolInstance.fuseEditPointsForOpenContourEndEdit =
    fuseEditPointsForOpenContourEndEdit.bind(toolInstance);
  toolInstance.openContourEditOverwriteEnd =
    openContourEditOverwriteEnd.bind(toolInstance);
  toolInstance.cancelOpenContourEdit = cancelOpenContourEdit.bind(toolInstance);
  toolInstance.completeOpenContourEdit =
    completeOpenContourEdit.bind(toolInstance);
}

export default registerOpenContourEditLoop;
