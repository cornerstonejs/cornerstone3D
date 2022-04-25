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
  getFirstIntersectionWithPolyline,
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

  this.closedContourEditData = {
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
    this.closedContourEditData;

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

  this.closedContourEditData.editIndex = currentEditIndex;

  if (!startCrossingPoint && editCanvasPoints.length > 1) {
    this.checkForFirstCrossing(evt);
  }

  this.findSnapIndex();

  if (startCrossingPoint) {
    this.checkForSecondCrossing(evt);
  }

  triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
}

// TODO_JAMES -> Check if we have finished an edit and start a new one.
function checkForSecondCrossing(evt) {
  const eventDetail = evt.detail;
  const { currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPoint = lastPoints.canvas;
  const { prevCanvasPoints, editCanvasPoints } = this.closedContourEditData;

  const crossedLineSegment = getFirstIntersectionWithPolyline(
    prevCanvasPoints,
    canvasPos,
    lastCanvasPoint,
    true
  );

  if (!crossedLineSegment) {
    return;
  }

  this.closedContourEditData.endCrossingPoint = crossedLineSegment;

  // Remove points up until just before the crossing
  for (let i = editCanvasPoints.length - 1; i > 0; i--) {
    const lastLine = [editCanvasPoints[i], editCanvasPoints[i - 1]];

    const didCrossLine = !!getFirstIntersectionWithPolyline(
      prevCanvasPoints,
      lastLine[0],
      lastLine[1],
      true
    );

    // Remove last element
    editCanvasPoints.pop();

    if (didCrossLine) {
      break;
    }
  }

  this.finishEditOnSecondCrossing(evt);
}

function finishEditOnSecondCrossing(evt) {
  console.log(
    'TODO_JAMES => On second crossing complete edit using first crossing + second crossing'
  );

  console.log(this.closedContourEditData);

  debugger;
}

// Check if this mouse move crossed the contour
function checkForFirstCrossing(evt) {
  const eventDetail = evt.detail;
  const { element, currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPoint = lastPoints.canvas;
  const { editCanvasPoints, prevCanvasPoints } = this.closedContourEditData;

  const crossedLineSegment = getFirstIntersectionWithPolyline(
    prevCanvasPoints,
    canvasPos,
    lastCanvasPoint,
    true
  );

  if (crossedLineSegment) {
    this.closedContourEditData.startCrossingPoint = crossedLineSegment;

    // On the first crossing, remove the first lines prior to the crossing
    this.removePointsUpUntilFirstCrossing();
  } else if (editCanvasPoints.length >= 2) {
    // -- Check if already crossing.
    // -- Check if extending a line back 6 (Proximity) canvas pixels would cross a line.
    // -- If so -> Extend line back that distance.

    // Extend point back 6 canvas pixels from first point.
    const dir = vec2.create();

    vec2.subtract(dir, editCanvasPoints[1], editCanvasPoints[0]);

    vec2.normalize(dir, dir);

    const proximity = 6;

    const extendedPoint = [
      editCanvasPoints[0][0] - dir[0] * proximity,
      editCanvasPoints[0][1] - dir[1] * proximity,
    ];

    const crossedLineSegmentFromExtendedPoint =
      getFirstIntersectionWithPolyline(
        prevCanvasPoints,
        extendedPoint,
        editCanvasPoints[0],
        true
      );

    if (crossedLineSegmentFromExtendedPoint) {
      // Add points.
      const pointsToPrepend = [extendedPoint];

      addCanvasPointsToArray(
        element,
        pointsToPrepend,
        editCanvasPoints[0],
        this.commonData
      );

      const numPointsPrepended = pointsToPrepend.length;

      let index = 0;

      for (let i = 0; i < numPointsPrepended - 1; i++) {
        const crossedLineSegment = getFirstIntersectionWithPolyline(
          prevCanvasPoints,
          pointsToPrepend[i],
          pointsToPrepend[i + 1],
          true
        );

        if (crossedLineSegment) {
          index = i;
          break;
        }
      }

      editCanvasPoints.unshift(...pointsToPrepend);

      // On the first crossing, remove the first lines prior to the crossing
      this.removePointsUpUntilFirstCrossing();

      this.closedContourEditData.editIndex = editCanvasPoints.length - 1;
      this.closedContourEditData.startCrossingPoint =
        crossedLineSegmentFromExtendedPoint;
    }
  }
}

function removePointsUpUntilFirstCrossing() {
  const { editCanvasPoints, prevCanvasPoints } = this.closedContourEditData;
  let numPointsToRemove = 0;

  for (let i = 0; i < editCanvasPoints.length - 1; i++) {
    const firstLine = [editCanvasPoints[i], editCanvasPoints[i + 1]];

    const didCrossLine = !!getFirstIntersectionWithPolyline(
      prevCanvasPoints,
      firstLine[0],
      firstLine[1],
      true
    );

    // Remove last element
    numPointsToRemove++;

    if (didCrossLine) {
      break;
    }
  }

  // Remove the points
  editCanvasPoints.splice(0, numPointsToRemove);

  this.closedContourEditData.editIndex = editCanvasPoints.length - 1;
}

function findSnapIndex() {
  const { editCanvasPoints, prevCanvasPoints, startCrossingPoint } =
    this.closedContourEditData;

  // find closest point.
  let closest = {
    value: Infinity,
    index: null,
  };

  if (
    !startCrossingPoint // Haven't crossed line yet
  ) {
    this.closedContourEditData.snapIndex = undefined;
  }

  const lastEditCanvasPoint = editCanvasPoints[editCanvasPoints.length - 1];

  for (let i = 0; i < prevCanvasPoints.length; i++) {
    const prevCanvasPoint = prevCanvasPoints[i];
    const distance = vec2.distance(prevCanvasPoint, lastEditCanvasPoint);

    if (distance < closest.value) {
      closest.value = distance;
      closest.index = i;
    }
  }

  this.closedContourEditData.snapIndex = closest.index;
}

function mouseUpClosedContourEditCallback(
  evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
) {
  console.log(
    'TODO_JAMES => On mouse up complete edit using first crossing + snap index'
  );

  console.log(this.closedContourEditData);

  const eventDetail = evt.detail;
  const { element } = eventDetail;

  this.isEditingClosed = false;

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
  toolInstance.findSnapIndex = findSnapIndex.bind(toolInstance);
  toolInstance.checkForFirstCrossing = checkForFirstCrossing.bind(toolInstance);
  toolInstance.checkForSecondCrossing =
    checkForSecondCrossing.bind(toolInstance);
  toolInstance.finishEditOnSecondCrossing =
    finishEditOnSecondCrossing.bind(toolInstance);
  toolInstance.removePointsUpUntilFirstCrossing =
    removePointsUpUntilFirstCrossing.bind(toolInstance);
}

export default registerClosedContourEditLoop;
