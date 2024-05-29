import isClosed from './isClosed.js';
import containsPoint from './containsPoint.js';
import containsPoints from './containsPoints.js';
import getAABB from './getAABB.js';
import getArea from './getArea.js';
import getSignedArea from './getSignedArea.js';
import getWindingDirection from './getWindingDirection.js';
import getNormal3 from './getNormal3.js';
import getNormal2 from './getNormal2.js';
import { mergePolylines, subtractPolylines } from './combinePolyline.js';
import intersectPolyline from './intersectPolyline.js';
import decimate from './decimate.js';
import getFirstLineSegmentIntersectionIndexes from './getFirstLineSegmentIntersectionIndexes.js';
import getLineSegmentIntersectionsIndexes from './getLineSegmentIntersectionsIndexes.js';
import getLineSegmentIntersectionsCoordinates from './getLineSegmentIntersectionsCoordinates.js';
import getClosestLineSegmentIntersection from './getClosestLineSegmentIntersection.js';
import getSubPixelSpacingAndXYDirections from './getSubPixelSpacingAndXYDirections.js';
import pointsAreWithinCloseContourProximity from './pointsAreWithinCloseContourProximity.js';
import addCanvasPointsToArray from './addCanvasPointsToArray.js';
import pointCanProjectOnLine from './pointCanProjectOnLine.js';
import { isPointInsidePolyline3D } from './isPointInsidePolyline3D.js';
import { projectTo2D } from './projectTo2D.js';

export {
  isClosed,
  containsPoint,
  containsPoints,
  getAABB,
  getArea,
  getSignedArea,
  getWindingDirection,
  getNormal3,
  getNormal2,
  intersectPolyline,
  decimate,
  getFirstLineSegmentIntersectionIndexes,
  getLineSegmentIntersectionsIndexes,
  getLineSegmentIntersectionsCoordinates,
  getClosestLineSegmentIntersection,
  getSubPixelSpacingAndXYDirections,
  pointsAreWithinCloseContourProximity,
  addCanvasPointsToArray,
  pointCanProjectOnLine,
  mergePolylines,
  subtractPolylines,
  isPointInsidePolyline3D,
  projectTo2D,
};
