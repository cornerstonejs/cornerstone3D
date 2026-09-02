import isClosed from './isClosed';
import containsPoint from './containsPoint';
import containsPoints from './containsPoints';
import getAABB from './getAABB';
import getArea from './getArea';
import getSignedArea from './getSignedArea';
import getWindingDirection from './getWindingDirection';
import getNormal3 from './getNormal3';
import getNormal2 from './getNormal2';
import subtractPolylines from './subtractPolylines';
import intersectPolylines from './intersectPolylines';
import { mergePolylines } from './combinePolyline';
import intersectPolyline from './intersectPolyline';
import decimate from './decimate';
import getFirstLineSegmentIntersectionIndexes from './getFirstLineSegmentIntersectionIndexes';
import getLineSegmentIntersectionsIndexes from './getLineSegmentIntersectionsIndexes';
import getLineSegmentIntersectionsCoordinates from './getLineSegmentIntersectionsCoordinates';
import getClosestLineSegmentIntersection from './getClosestLineSegmentIntersection';
import getSubPixelSpacingAndXYDirections from './getSubPixelSpacingAndXYDirections';
import pointsAreWithinCloseContourProximity from './pointsAreWithinCloseContourProximity';
import addCanvasPointsToArray from './addCanvasPointsToArray';
import pointCanProjectOnLine from './pointCanProjectOnLine';
import { isPointInsidePolyline3D } from './isPointInsidePolyline3D';
import { projectTo2D } from './projectTo2D';
import convexHull from './convexHull';
import arePolylinesIdentical from './arePolylinesIdentical';

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
  intersectPolylines,
  isPointInsidePolyline3D,
  projectTo2D,
  convexHull,
  arePolylinesIdentical,
};
