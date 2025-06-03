import areSameSegment from './areSameSegment';
import { add, subtraction, intersect, xor } from './logicalOperators';
export { default as isContourSegmentationAnnotation } from './isContourSegmentationAnnotation';
export { addContourSegmentationAnnotation } from './addContourSegmentationAnnotation';
export { removeContourSegmentationAnnotation } from './removeContourSegmentationAnnotation';
export { findAllIntersectingContours } from './getIntersectingAnnotations';
export { processMultipleIntersections } from './mergeMultipleAnnotations';
export { contourSegmentationOperation } from './contourSegmentationOperation';
export * from './sharedOperations';

export { add, subtraction, intersect, xor, areSameSegment };

export {
  unifyPolylineSets,
  unifyMultiplePolylineSets,
  unifyAnnotationPolylines,
  subtractPolylineSets,
  subtractMultiplePolylineSets,
  subtractAnnotationPolylines,
} from './unifyPolylineSets';
