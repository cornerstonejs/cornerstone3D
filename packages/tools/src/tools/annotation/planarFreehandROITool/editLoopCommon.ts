import { polyline } from '../../../utilities/math';
import { vec2 } from 'gl-matrix';

const { addCanvasPointsToArray, getFirstIntersectionWithPolyline } = polyline;

// Check if this mouse move crossed the contour
function checkForFirstCrossing(evt, isClosedContour) {
  const eventDetail = evt.detail;
  const { element, currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPoint = lastPoints.canvas;
  const { editCanvasPoints, prevCanvasPoints } = this.commonEditData;

  const crossedLineSegment = getFirstIntersectionWithPolyline(
    prevCanvasPoints,
    canvasPos,
    lastCanvasPoint,
    isClosedContour
  );

  if (crossedLineSegment) {
    this.commonEditData.startCrossingPoint = crossedLineSegment;

    // On the first crossing, remove the first lines prior to the crossing
    this.removePointsUpUntilFirstCrossing(isClosedContour);
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

      // On the first crossing, remove the first lines prior to the crossing
      this.removePointsUpUntilFirstCrossing(isClosedContour);

      this.commonEditData.editIndex = editCanvasPoints.length - 1;
      this.commonEditData.startCrossingPoint =
        crossedLineSegmentFromExtendedPoint;
    }
  }
}

function removePointsUpUntilFirstCrossing(isClosedContour) {
  const { editCanvasPoints, prevCanvasPoints } = this.commonEditData;
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

  this.commonEditData.editIndex = editCanvasPoints.length - 1;
}

function checkForSecondCrossing(evt, isClosedContour) {
  const eventDetail = evt.detail;
  const { currentPoints, lastPoints } = eventDetail;
  const canvasPos = currentPoints.canvas;
  const lastCanvasPoint = lastPoints.canvas;
  const { prevCanvasPoints, editCanvasPoints } = this.commonEditData;

  const crossedLineSegment = getFirstIntersectionWithPolyline(
    prevCanvasPoints,
    canvasPos,
    lastCanvasPoint,
    isClosedContour
  );

  if (!crossedLineSegment) {
    return false;
  }

  this.commonEditData.endCrossingPoint = crossedLineSegment;

  // Remove points up until just before the crossing
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

  return true;
}

function findSnapIndex() {
  // TODO_JAMES -> If you snap line crosses your edit line, you should try to find a new snap index instead.
  // For closed contours try left and right of the current point until you find a match?
  // Or sort points by distance and try and find the correct one.
  // --> TODO_JAMES -> What to do if one cannot be found???
  // TODO_JAMES -> Cornerstone3D events
  // TODO_JAMES -> Edit issues when scrolling over annotatons.

  const { editCanvasPoints, prevCanvasPoints, startCrossingPoint } =
    this.commonEditData;

  // find closest point.
  let closest = {
    value: Infinity,
    index: null,
  };

  if (
    !startCrossingPoint // Haven't crossed line yet
  ) {
    return;
  }

  const lastEditCanvasPoint = editCanvasPoints[editCanvasPoints.length - 1];

  const distanceIndexPairs = [];

  for (let i = 0; i < prevCanvasPoints.length; i++) {
    const prevCanvasPoint = prevCanvasPoints[i];
    const distance = vec2.distance(prevCanvasPoint, lastEditCanvasPoint);

    distanceIndexPairs.push({ distance, index: i });

    if (distance < closest.value) {
      closest.value = distance;
      closest.index = i;
    }
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

  // If none didn't cross, this means we should start a new edit. Use -1 to signify this.
  return -1;
}

function registerEditLoopCommon(toolInstance) {
  toolInstance.checkForFirstCrossing = checkForFirstCrossing.bind(toolInstance);
  toolInstance.removePointsUpUntilFirstCrossing =
    removePointsUpUntilFirstCrossing.bind(toolInstance);
  toolInstance.checkForSecondCrossing =
    checkForSecondCrossing.bind(toolInstance);
  toolInstance.findSnapIndex = findSnapIndex.bind(toolInstance);
}

export default registerEditLoopCommon;
