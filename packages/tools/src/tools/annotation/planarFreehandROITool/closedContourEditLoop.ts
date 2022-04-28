import { getEnabledElement } from '@cornerstonejs/core';
import { state } from '../../../store';
import { Events } from '../../../enums';
import type { Types } from '@cornerstonejs/core';
import {
  resetElementCursor,
  hideElementCursor,
} from '../../../cursors/elementCursor';
import { EventTypes } from '../../../types';
import { polyline } from '../../../utilities/math';
import { vec3, vec2 } from 'gl-matrix';
import triggerAnnotationRenderForViewportIds from '../../../utilities/triggerAnnotationRenderForViewportIds';

const {
  getSpacingAndXYDirections,
  addCanvasPointsToArray,
  calculateAreaOfPoints,
} = polyline;

function activateClosedContourEdit(
  evt: EventTypes.MouseDownActivateEventType,
  annotation: Types.Annotation,
  viewportIdsToRender: string[]
) {
  this.isEditingClosed = true;

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

  hideElementCursor(element);
}

function deactivateClosedContourEdit(element: HTMLDivElement) {
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

  resetElementCursor(element);
}

function mouseDragClosedContourEditCallback(
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
    this.checkForFirstCrossing(evt, true);
  }

  this.commonEditData.snapIndex = this.findSnapIndex();

  if (this.commonEditData.snapIndex === -1) {
    console.log('Stuck start new edit');
    this.finishEditAndStartNewEdit(evt);
    return;
  }

  this.commonEditData.fusedCanvasPoints =
    this.fuseEditPointsWithClosedContour(evt);

  if (startCrossingPoint && this.checkForSecondCrossing(evt, true)) {
    console.log('Cross start new edit');
    this.finishEditAndStartNewEdit(evt);
  }

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

function finishEditAndStartNewEdit(evt) {
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
  annotation.data.isOpenContour = false;

  const lastEditCanvasPoint = editCanvasPoints.pop();

  this.commonEditData = {
    prevCanvasPoints: fusedCanvasPoints,
    editCanvasPoints: [lastEditCanvasPoint],
    startCrossingPoint: undefined,
    endCrossingPoint: undefined,
    editIndex: 0,
    snapIndex: undefined,
  };

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

function fuseEditPointsWithClosedContour(evt) {
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

  // Generate two possible contours that could be intepretted from the edit:
  //
  // pointSet1 => 0 -> low -> edit -> high - max.
  // pointSet2 => low -> high -> edit
  //
  // Depending on the placement of the edit and the origin, either of these could be the intended edit.
  // We'll choose the one with the largest area, as edits are considered to be changes to the original area with
  // A relative change of much less than unity.

  // Point Set 1
  let pointSet1 = [];

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
  let pointSet2 = [];

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

  const pointsToRender = areaPointSet1 > areaPointSet2 ? pointSet1 : pointSet2;

  return pointsToRender;
}

function mouseUpClosedContourEditCallback(
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
    annotation.data.isOpenContour = false;
  }

  this.isEditingClosed = false;
  this.commonEditData = undefined;
  this.commonData = undefined;

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

  this.deactivateClosedContourEdit(element);
}

function registerClosedContourEditLoop(toolInstance) {
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
}

export default registerClosedContourEditLoop;
