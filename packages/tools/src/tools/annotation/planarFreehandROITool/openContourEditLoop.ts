import { getEnabledElement } from '@cornerstonejs/core';
import { state } from '../../../store';
import { Events } from '../../../enums';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';
import { EventTypes } from '../../../types';
import { vec3, vec2 } from 'gl-matrix';
import { polyline } from '../../../utilities/math';
import triggerAnnotationRenderForViewportIds from '../../../utilities/triggerAnnotationRenderForViewportIds';

const { addCanvasPointsToArray, getSpacingAndXYDirections } = polyline;

function activateOpenContourEdit(
  evt: EventTypes.MouseDownActivateEventType,
  annotation: Types.Annotation,
  viewportIdsToRender: string[]
) {
  this.isEditingOpen = true;

  const eventDetail = evt.detail;
  const { currentPoints, element } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const enabledElement = getEnabledElement(element);
  const { viewport } = enabledElement;

  const prevCanvasPoints = annotation.data.polyline.map(viewport.worldToCanvas);

  const { spacing, xDir, yDir } = getSpacingAndXYDirections(
    viewport,
    this.configuration.subPixelResolution
  );

  this.commonEditData = {
    prevCanvasPoints,
    editCanvasPoints: [canvasPos],
    startCrossingPoint: undefined,
    endCrossingPoint: undefined,
    editIndex: 0,
  };

  this.commonData = {
    annotation,
    viewportIdsToRender,
    spacing,
    xDir,
    yDir,
  };

  this.openContourEditData = {
    overwriteStart: false,
    overwriteEnd: false,
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

  hideElementCursor(element);
}

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

  resetElementCursor(element);
}

function mouseDragOpenContourEditCallback(
  evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
) {
  const eventDetail = evt.detail;
  const { currentPoints, element } = eventDetail;
  const worldPos = currentPoints.world;
  const canvasPos = currentPoints.canvas;
  const enabledElement = getEnabledElement(element);
  const { renderingEngine, viewport } = enabledElement;

  const { viewportIdsToRender, xDir, yDir, spacing } = this.commonData;
  const { editIndex, editCanvasPoints, startCrossingPoint } =
    this.commonEditData;

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

  const numPointsAdded = addCanvasPointsToArray(
    element,
    editCanvasPoints,
    canvasPos,
    this.commonData
  );

  const currentEditIndex = editIndex + numPointsAdded;

  this.commonEditData.editIndex = currentEditIndex;

  if (!startCrossingPoint && editCanvasPoints.length > 1) {
    this.checkForFirstCrossing(evt, false);
  }

  this.findSnapIndex();

  this.checkIfShouldOverwriteAnEnd(evt);

  this.commonEditData.fusedCanvasPoints =
    this.fuseEditPointsWithOpenContour(evt);

  if (startCrossingPoint && this.checkForSecondCrossing(evt, false)) {
    this.finishEditOpenOnSecondCrossing(evt);
  }

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

function checkIfShouldOverwriteAnEnd(evt) {
  const eventDetail = evt.detail;
  const { currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPos = lastPoints.canvas;

  const { snapIndex, prevCanvasPoints, editCanvasPoints, startCrossingPoint } =
    this.commonEditData;

  const { overwriteStart, overwriteEnd } = this.openContourEditData;

  if (overwriteStart || overwriteEnd) {
    // Already triggered overwrite.
    return;
  }

  if (snapIndex !== 0 && snapIndex !== prevCanvasPoints.length - 1) {
    // Edit not started, or not snapping to final index
    return;
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
    debugger;
    // TODO_JAMES ->  jump to a normal line edit now.
  }
}

function fuseEditPointsWithOpenContour(evt) {
  // TODO - If the snapIndex is the first or last contour and the angle to that
  // point is less than 90 degrees from the last line segment -> cement contour and swap to a draw:
  // new contour, either:
  // - If snapIndex === end
  // -- start -> edit
  // - if snapIndex == start
  // -- end -> edit
  // On mouse up, just end edit (or draw from draw loop)
  // On line cross, start a new open edit.

  const { prevCanvasPoints, editCanvasPoints, startCrossingPoint, snapIndex } =
    this.commonEditData;

  if (startCrossingPoint === undefined || snapIndex === undefined) {
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

  const startCrossingIndex = startCrossingPoint[0];
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

  let inPlaceDistance =
    distanceBetweenLowAndFirstPoint + distanceBetweenHighAndLastPoint;

  let reverseDistance =
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

  // Add points from the orignal contour's high index up to to its end point.
  for (let i = highIndex; i < prevCanvasPoints.length; i++) {
    const canvasPoint = prevCanvasPoints[i];

    pointsToRender.push([canvasPoint[0], canvasPoint[1]]);
  }

  return pointsToRender;
}

function finishEditOpenOnSecondCrossing(evt) {
  const eventDetail = evt.detail;
  const { element } = eventDetail;
  const enabledElement = getEnabledElement(element);
  const { viewport, renderingEngine } = enabledElement;

  const { annotation, viewportIdsToRender } = this.commonData;
  const { fusedCanvasPoints, editCanvasPoints } = this.commonEditData;

  const worldPoints = fusedCanvasPoints.map((canvasPoint) =>
    viewport.canvasToWorld(canvasPoint)
  );

  annotation.data.polyline = worldPoints;
  annotation.data.isOpenContour = true;

  const lastEditCanvasPoint = editCanvasPoints.pop();

  this.commonEditData = {
    prevCanvasPoints: fusedCanvasPoints,
    editCanvasPoints: [lastEditCanvasPoint],
    startCrossingPoint: undefined,
    endCrossingPoint: undefined,
    editIndex: 0,
  };

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

function mouseUpOpenContourEditCallback(
  evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
) {
  const eventDetail = evt.detail;
  const { element } = eventDetail;
  const enabledElement = getEnabledElement(element);
  const { viewport, renderingEngine } = enabledElement;

  const { annotation, viewportIdsToRender } = this.commonData;
  const { fusedCanvasPoints } = this.commonEditData;

  if (fusedCanvasPoints) {
    const worldPoints = fusedCanvasPoints.map((canvasPoint) =>
      viewport.canvasToWorld(canvasPoint)
    );

    annotation.data.polyline = worldPoints;
    annotation.data.isOpenContour = true;
  }

  this.isEditingOpen = false;
  this.commonEditData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateOpenContourEdit(element);
}

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
}

export default registerOpenContourEditLoop;
