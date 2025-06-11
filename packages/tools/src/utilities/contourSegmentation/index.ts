import areSameSegment from './areSameSegment';
import convertContourSegmentationAnnotation from './convertContourSegmentation';
import { addition, subtraction } from './logicalOperators';
export { default as isContourSegmentationAnnotation } from './isContourSegmentationAnnotation';
export { addContourSegmentationAnnotation } from './addContourSegmentationAnnotation';
export { removeContourSegmentationAnnotation } from './removeContourSegmentationAnnotation';
export { findAllIntersectingContours } from './getIntersectingAnnotations';
export { processMultipleIntersections } from './mergeMultipleAnnotations';
export { contourSegmentationOperation } from './contourSegmentationOperation';
export * from './sharedOperations';

export {
  addition,
  subtraction,
  areSameSegment,
  convertContourSegmentationAnnotation,
};

export {
  unifyPolylineSets,
  unifyMultiplePolylineSets,
  unifyAnnotationPolylines,
  subtractPolylineSets,
  subtractMultiplePolylineSets,
  subtractAnnotationPolylines,
} from './unifyPolylineSets';
