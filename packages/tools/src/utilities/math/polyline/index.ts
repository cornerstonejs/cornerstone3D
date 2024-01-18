import isClosed from './isClosed';
import containsPoint from './containsPoint';
import getAABB from './getAABB';
import getNormal3 from './getNormal3';
import getNormal2 from './getNormal2';
import { mergePolylines, subtractPolylines } from './combinePolyline';
import intersectPolyline from './intersectPolyline';
import getFirstLineSegmentIntersectionIndexes from './getFirstLineSegmentIntersectionIndexes';
import getLineSegmentIntersectionsIndexes from './getLineSegmentIntersectionsIndexes';
import getLineSegmentIntersectionsCoordinates from './getLineSegmentIntersectionsCoordinates';
import getClosestLineSegmentIntersection from './getClosestLineSegmentIntersection';
import getSubPixelSpacingAndXYDirections from './getSubPixelSpacingAndXYDirections';
import pointsAreWithinCloseContourProximity from './pointsAreWithinCloseContourProximity';
import addCanvasPointsToArray from './addCanvasPointsToArray';
import pointCanProjectOnLine from './pointCanProjectOnLine';
import calculateAreaOfPoints from './calculateAreaOfPoints';

export {
  isClosed,
  containsPoint,
  getAABB,
  getNormal3,
  getNormal2,
  intersectPolyline,
  getFirstLineSegmentIntersectionIndexes,
  getLineSegmentIntersectionsIndexes,
  getLineSegmentIntersectionsCoordinates,
  getClosestLineSegmentIntersection,
  getSubPixelSpacingAndXYDirections,
  pointsAreWithinCloseContourProximity,
  addCanvasPointsToArray,
  pointCanProjectOnLine,
  calculateAreaOfPoints,
  mergePolylines,
  subtractPolylines,
};
