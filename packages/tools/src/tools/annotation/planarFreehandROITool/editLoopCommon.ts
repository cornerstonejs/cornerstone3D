import { Types } from '@cornerstonejs/core';
import { vec2 } from 'gl-matrix';
import { polyline } from '../../../utilities/math';
import { EventTypes } from '../../../types';

const { addCanvasPointsToArray, getFirstIntersectionWithPolyline } = polyline;

/**
 * Check if the `editCanvasPoints` have crossed the `prevCanvasPoints` during
 * an edit.
 *
 * @privateRemarks The following tricks are required to make the UX smooth and
 * the editing not very picky on exactly where you click:
 * - If we don't cross after 2 points, but projecting the line backwards the
 * proximity distance means we cross, extend the line back.
 * - If we travel the full proximity in canvas points but don't cross a line, we
 * are likely drawing along the line, which is intuitive to the user. At this point
 * snap the start of the edit to the closest place on the `prevCanvasPoints`,
 * so that the edit can be executed in-line.
 */
function checkForFirstCrossing(
  evt: EventTypes.InteractionEventType,
  isClosedContour: boolean
): void {
  const eventDetail = evt.detail;
  const { element, currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPoint = lastPoints.canvas;
  const { editCanvasPoints, prevCanvasPoints } = this.editData;

  const crossedLineSegment = getFirstIntersectionWithPolyline(
    prevCanvasPoints,
    canvasPos,
    lastCanvasPoint,
    isClosedContour
  );

  if (crossedLineSegment) {
    this.editData.startCrossingIndex = crossedLineSegment[0];

    // On the first crossing, remove the first lines prior to the crossing
    this.removePointsUpUntilFirstCrossing(isClosedContour);
    // prevent continue if there are not the minimum of points for this op.
  } else if (prevCanvasPoints.length >= 2) {
    if (
      editCanvasPoints.length >
      this.configuration.checkCanvasEditFallbackProximity
    ) {
      // At this point, likely we are drawing along the line, we are past the proximity for grabbing.
      // Search for nearest line segment to the start of the edit.
      // Set the crossing index to the lower index of the segment.

      const firstEditCanvasPoint = editCanvasPoints[0];

      const distanceIndexPairs = [];

      for (let i = 0; i < prevCanvasPoints.length; i++) {
        const prevCanvasPoint = prevCanvasPoints[i];
        const distance = vec2.distance(prevCanvasPoint, firstEditCanvasPoint);

        distanceIndexPairs.push({ distance, index: i });
      }

      distanceIndexPairs.sort((a, b) => a.distance - b.distance);

      const twoClosestDistanceIndexPairs = [
        distanceIndexPairs[0],
        distanceIndexPairs[1],
      ];

      const lowestIndex = Math.min(
        twoClosestDistanceIndexPairs[0].index,
        twoClosestDistanceIndexPairs[1].index
      );

      this.editData.startCrossingIndex = lowestIndex;
    } else {
      // Check if extending a line back 6 (Proximity) canvas pixels would cross a line.

      // Extend point back 6 canvas pixels from first point.
      const dir = vec2.create();

      vec2.subtract(dir, editCanvasPoints[1], editCanvasPoints[0]);
      vec2.normalize(dir, dir);

      const proximity = 6;

      const extendedPoint: Types.Point2 = [
        editCanvasPoints[0][0] - dir[0] * proximity,
        editCanvasPoints[0][1] - dir[1] * proximity,
      ];

      const crossedLineSegmentFromExtendedPoint =
        getFirstIntersectionWithPolyline(
          prevCanvasPoints,
          extendedPoint,
          editCanvasPoints[0],
          isClosedContour
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

        editCanvasPoints.unshift(...pointsToPrepend);

        this.removePointsUpUntilFirstCrossing(isClosedContour);

        this.editData.editIndex = editCanvasPoints.length - 1;
        this.editData.startCrossingIndex =
          crossedLineSegmentFromExtendedPoint[0];
      }
    }
  }
}

/**
 * Removes the points from the `editCanvasPoints` up until the first crossing of
 * the `prevCanvasPoints`. This is so we can just insert this line segment
 * into the contour.
 */
function removePointsUpUntilFirstCrossing(isClosedContour: boolean): void {
  const { editCanvasPoints, prevCanvasPoints } = this.editData;
  let numPointsToRemove = 0;

  for (let i = 0; i < editCanvasPoints.length - 1; i++) {
    const firstLine = [editCanvasPoints[i], editCanvasPoints[i + 1]];

    const didCrossLine = !!getFirstIntersectionWithPolyline(
      prevCanvasPoints,
      firstLine[0],
      firstLine[1],
      isClosedContour
    );

    // Remove last element
    numPointsToRemove++;

    if (didCrossLine) {
      break;
    }
  }

  // Remove the points
  editCanvasPoints.splice(0, numPointsToRemove);

  this.editData.editIndex = editCanvasPoints.length - 1;
}

/**
 * Returns `true` if the `editCanvasPoints` crosses the `prevCanvasPoints` a
 * second time.
 */
function checkForSecondCrossing(
  evt: EventTypes.InteractionEventType,
  isClosedContour: boolean
): boolean {
  const eventDetail = evt.detail;
  const { currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPoint = lastPoints.canvas;
  const { prevCanvasPoints } = this.editData;

  // Note this method is looking for the first corssing found of
  // *the lines given* to it. The parameters given to it are specified to search
  // for the second crossing of the prevCanvasPoints, by checking if the last
  // mouse drag crossed these. This class method is only called if the edit loop
  // has already has a crossing earlier in the edit.
  const crossedLineSegment = getFirstIntersectionWithPolyline(
    prevCanvasPoints,
    canvasPos,
    lastCanvasPoint,
    isClosedContour
  );

  if (!crossedLineSegment) {
    return false;
  }

  return true;
}

/**
 * Removes the points from the `editCanvasPoints` after the second crossing of
 * the `prevCanvasPoints`. This is so we can just insert this line segment
 * into the contour.
 */
function removePointsAfterSecondCrossing(isClosedContour: boolean): void {
  const { prevCanvasPoints, editCanvasPoints } = this.editData;

  // Remove points after the crossing
  for (let i = editCanvasPoints.length - 1; i > 0; i--) {
    const lastLine = [editCanvasPoints[i], editCanvasPoints[i - 1]];

    const didCrossLine = !!getFirstIntersectionWithPolyline(
      prevCanvasPoints,
      lastLine[0],
      lastLine[1],
      isClosedContour
    );

    // Remove last element
    editCanvasPoints.pop();

    if (didCrossLine) {
      break;
    }
  }
}

/**
 * During an edit, finds the index on the `prevCanvasPoints` that the
 * `editCanvasPoints` should snap to to create one continuous contour.
 *
 * Returns the index, but returns -1 if there is no index on the
 * `prevCanvasPoints` that can be snapped to with causing a crossing of the
 * `editCanvasPoints`.
 */
function findSnapIndex(): number {
  const { editCanvasPoints, prevCanvasPoints, startCrossingIndex } =
    this.editData;

  if (
    startCrossingIndex === undefined // Haven't crossed line yet
  ) {
    return;
  }

  const lastEditCanvasPoint = editCanvasPoints[editCanvasPoints.length - 1];

  const distanceIndexPairs = [];

  for (let i = 0; i < prevCanvasPoints.length; i++) {
    const prevCanvasPoint = prevCanvasPoints[i];
    const distance = vec2.distance(prevCanvasPoint, lastEditCanvasPoint);

    distanceIndexPairs.push({ distance, index: i });
  }

  distanceIndexPairs.sort((a, b) => a.distance - b.distance);

  // Search through from shortest distance and check which snap line doesn't
  // Cross the edit line, in most cases the snap index will just be the first one.
  const editCanvasPointsLessLastOne = editCanvasPoints.slice(0, -1);

  for (let i = 0; i < distanceIndexPairs.length; i++) {
    const { index } = distanceIndexPairs[i];
    const snapCanvasPosition = prevCanvasPoints[index];
    const lastEditCanvasPoint = editCanvasPoints[editCanvasPoints.length - 1];

    const crossedLineSegment = getFirstIntersectionWithPolyline(
      editCanvasPointsLessLastOne,
      snapCanvasPosition,
      lastEditCanvasPoint,
      false // The edit line is not a closed contour
    );

    if (!crossedLineSegment) {
      return index;
    }
  }

  // If all of the lines caused a crossing, this means we should start a new edit.
  // Use -1 to signify this.
  return -1;
}

/**
 * Checks if the `editCanvasPoints` cross themselves. If they do, remove the
 * region after the cross index, these removes isolated "island" loops that the
 * user can draw which make closed contours no longer simple polygons, or open
 * contours twisted.
 */
function checkAndRemoveCrossesOnEditLine(
  evt: EventTypes.InteractionEventType
): number | undefined {
  const eventDetail = evt.detail;
  const { currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPoint = lastPoints.canvas;

  const { editCanvasPoints } = this.editData;

  const editCanvasPointsLessLastOne = editCanvasPoints.slice(0, -2);

  const crossedLineSegment = getFirstIntersectionWithPolyline(
    editCanvasPointsLessLastOne,
    canvasPos,
    lastCanvasPoint,
    false
  );

  if (!crossedLineSegment) {
    return;
  }

  // We have found a crossing, remove points after the crossing, cutting off
  // the "island" loop drawn.

  const editIndexCrossed = crossedLineSegment[0];
  const numPointsToRemove = editCanvasPoints.length - editIndexCrossed;

  for (let i = 0; i < numPointsToRemove; i++) {
    editCanvasPoints.pop();
  }
}

/**
 * Registers the contour drawing loop to the tool instance.
 */
function registerEditLoopCommon(toolInstance) {
  toolInstance.checkForFirstCrossing = checkForFirstCrossing.bind(toolInstance);
  toolInstance.removePointsUpUntilFirstCrossing =
    removePointsUpUntilFirstCrossing.bind(toolInstance);
  toolInstance.checkForSecondCrossing =
    checkForSecondCrossing.bind(toolInstance);
  toolInstance.findSnapIndex = findSnapIndex.bind(toolInstance);
  toolInstance.removePointsAfterSecondCrossing =
    removePointsAfterSecondCrossing.bind(toolInstance);
  toolInstance.checkAndRemoveCrossesOnEditLine =
    checkAndRemoveCrossesOnEditLine.bind(toolInstance);
}

export default registerEditLoopCommon;
